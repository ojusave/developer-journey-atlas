import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { RuntimeConfig } from "./config.js";
import { createSessionSchema, submitTurnSchema, workflowTurnSchema } from "./domain.js";
import { AppError, isAppError } from "./errors.js";
import type { SafeLogger } from "./privacy.js";
import type { DiagnosticService } from "./service.js";
import type { DiagnosticStore } from "./store.js";
import { anonymousClientKey, enforceRateLimit, FixedWindowRateLimiter } from "./rate-limit.js";

const uuidSchema = z.string().uuid();
const maxBodyBytes = 64 * 1024;

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new AppError(415, "json_required", "Use application/json for this request");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBodyBytes) throw new AppError(413, "body_too_large", "Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "invalid_json", "Request body is not valid JSON");
  }
}

function bearerToken(request: IncomingMessage): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ") || header.length < 40) {
    throw new AppError(401, "session_token_required", "A session token is required");
  }
  return header.slice(7);
}

function secretMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function mimeType(path: string): string {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".woff2": "font/woff2",
  } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}

function serveStatic(requestPath: string, response: ServerResponse): boolean {
  const root = resolve(process.cwd(), "dist");
  const requested = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  let path = resolve(root, requested);
  if (path !== root && !path.startsWith(`${root}${sep}`)) return false;
  if (!existsSync(path) || !statSync(path).isFile()) path = resolve(root, "index.html");
  if (!existsSync(path) || !statSync(path).isFile()) return false;
  const cacheControl = path.endsWith("index.html") || path.endsWith("sw.js")
    ? "no-cache"
    : requested.startsWith("assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600";
  response.writeHead(200, {
    "Content-Type": mimeType(path),
    "Cache-Control": cacheControl,
  });
  createReadStream(path).pipe(response);
  return true;
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function createScannerServer(
  service: DiagnosticService,
  store: DiagnosticStore,
  config: RuntimeConfig,
  logger: SafeLogger,
): Server {
  const windowMs = config.rateLimitWindowSeconds * 1_000;
  const sessionCreateLimiter = new FixedWindowRateLimiter(config.sessionCreateLimit, windowMs);
  const sessionTurnLimiter = new FixedWindowRateLimiter(config.sessionTurnLimit, windowMs);
  const ipTurnLimiter = new FixedWindowRateLimiter(config.ipTurnLimit, windowMs);
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    applySecurityHeaders(response);
    response.setHeader("X-Request-Id", requestId);
    try {
      const url = new URL(request.url ?? "/", "http://scanner.local");
      const method = request.method ?? "GET";
      const clientKey = anonymousClientKey(request, config.trustProxy, config.envelopeKey);

      if (config.appOrigin && request.headers.origin) {
        if (request.headers.origin !== config.appOrigin) throw new AppError(403, "origin_not_allowed", "This origin is not allowed");
        response.setHeader("Access-Control-Allow-Origin", config.appOrigin);
        response.setHeader("Vary", "Origin");
      }

      if (method === "GET" && url.pathname === "/healthz") {
        const healthy = await store.healthCheck();
        sendJson(response, healthy ? 200 : 503, { status: healthy ? "ok" : "unavailable" });
        return;
      }

      if (method === "POST" && url.pathname === "/api/sessions") {
        enforceRateLimit(sessionCreateLimiter, clientKey, response);
        const parsed = createSessionSchema.parse(await readJson(request));
        sendJson(response, 201, await service.createSession(parsed.context));
        return;
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})$/i);
      if (sessionMatch && method === "GET") {
        sendJson(response, 200, { session: await service.getSession(uuidSchema.parse(sessionMatch[1]), bearerToken(request)) });
        return;
      }
      if (sessionMatch && method === "DELETE") {
        await service.deleteSession(uuidSchema.parse(sessionMatch[1]), bearerToken(request));
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }

      const turnsMatch = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns$/i);
      if (turnsMatch && method === "POST") {
        enforceRateLimit(ipTurnLimiter, clientKey, response);
        enforceRateLimit(sessionTurnLimiter, `session:${turnsMatch[1]}`, response);
        const idempotencyKey = uuidSchema.parse(request.headers["idempotency-key"]);
        const result = await service.submitTurn(
          uuidSchema.parse(turnsMatch[1]),
          bearerToken(request),
          idempotencyKey,
          submitTurnSchema.parse(await readJson(request)),
        );
        sendJson(response, result.turn.status === "completed" ? 200 : 202, result);
        return;
      }

      const turnMatch = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns\/([0-9a-f-]{36})$/i);
      if (turnMatch && method === "GET") {
        sendJson(response, 200, { turn: await service.getTurn(uuidSchema.parse(turnMatch[1]), bearerToken(request), uuidSchema.parse(turnMatch[2])) });
        return;
      }

      const retryMatch = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns\/([0-9a-f-]{36})\/retry$/i);
      if (retryMatch && method === "POST") {
        enforceRateLimit(ipTurnLimiter, clientKey, response);
        enforceRateLimit(sessionTurnLimiter, `session:${retryMatch[1]}`, response);
        const result = await service.retryTurn(uuidSchema.parse(retryMatch[1]), bearerToken(request), uuidSchema.parse(retryMatch[2]));
        sendJson(response, result.turn.status === "completed" ? 200 : 202, result);
        return;
      }

      if (url.pathname === "/internal/workflow/turn" && method === "POST") {
        if (!config.internalWorkflowSecret) throw new AppError(503, "workflow_callback_disabled", "Workflow callback is not configured");
        const actual = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : "";
        if (!secretMatches(actual, config.internalWorkflowSecret)) throw new AppError(401, "workflow_secret_invalid", "Workflow authorization failed");
        const result = await service.processWorkflowTurn(workflowTurnSchema.parse(await readJson(request)));
        sendJson(response, 200, result);
        return;
      }

      if (method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/internal/")) {
        if (serveStatic(url.pathname, response)) return;
      }
      throw new AppError(404, "route_not_found", "Route not found");
    } catch (error) {
      const appError = isAppError(error)
        ? error
        : error instanceof z.ZodError
          ? new AppError(400, "invalid_request", "The request did not match the expected format", error.issues)
          : new AppError(500, "internal_error", "The request could not be completed");
      logger[appError.statusCode >= 500 ? "error" : "warn"]({
        event: "http_request_failed",
        requestId,
        status: String(appError.statusCode),
        errorCode: appError.code,
        latencyMs: Date.now() - startedAt,
      });
      const retryTurnId = appError.code === "turn_retryable"
        && appError.details
        && typeof appError.details === "object"
        && "turnId" in appError.details
        && uuidSchema.safeParse((appError.details as { turnId?: unknown }).turnId).success
        ? (appError.details as { turnId: string }).turnId
        : null;
      const safeDetails = retryTurnId
        ? { turnId: retryTurnId }
        : appError.statusCode < 500
          ? appError.details
          : undefined;
      sendJson(response, appError.statusCode, {
        error: {
          code: appError.code,
          message: appError.message,
          ...(safeDetails ? { details: safeDetails } : {}),
        },
        requestId,
      });
    }
  });
}
