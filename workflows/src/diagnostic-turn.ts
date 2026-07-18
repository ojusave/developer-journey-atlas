const INPUT_KEYS = ["idempotencyKey", "sessionRevision", "turnId"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set(["applied", "duplicate", "superseded"]);

export interface DiagnosticTurnInput {
  turnId: string;
  sessionRevision: number;
  idempotencyKey: string;
}

export interface DiagnosticTurnResult {
  turnId: string;
  sessionRevision: number;
  status: "applied" | "duplicate" | "superseded";
}

export interface DiagnosticTurnRuntime {
  baseUrl: string;
  secret: string;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireOpaqueId(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a UUID.`);
  }
  return value;
}

export function parseDiagnosticTurnInput(value: unknown): DiagnosticTurnInput {
  if (!isRecord(value)) {
    throw new TypeError("Diagnostic turn input must be an object.");
  }

  const keys = Object.keys(value).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) {
    throw new TypeError("Diagnostic turn input contains unexpected fields.");
  }

  if (!Number.isSafeInteger(value.sessionRevision) || Number(value.sessionRevision) < 1) {
    throw new TypeError("sessionRevision must be a positive safe integer.");
  }

  return {
    turnId: requireOpaqueId(value.turnId, "turnId"),
    sessionRevision: Number(value.sessionRevision),
    idempotencyKey: requireOpaqueId(value.idempotencyKey, "idempotencyKey"),
  };
}

function parseRuntimeResult(value: unknown, input: DiagnosticTurnInput): DiagnosticTurnResult {
  if (!isRecord(value) || !TERMINAL_STATUSES.has(String(value.status))) {
    throw new Error("The diagnostic runtime returned an invalid result.");
  }

  const turnId = requireOpaqueId(value.turnId, "turnId");
  const sessionRevision = Number(value.sessionRevision);
  if (!Number.isSafeInteger(sessionRevision) || sessionRevision < 1) {
    throw new Error("The diagnostic runtime returned an invalid session revision.");
  }

  if (
    turnId !== input.turnId ||
    sessionRevision !== input.sessionRevision
  ) {
    throw new Error("The diagnostic runtime result does not match the requested turn.");
  }

  return {
    turnId,
    sessionRevision,
    status: value.status as DiagnosticTurnResult["status"],
  };
}

function runtimeEndpoint(baseUrl: string): URL {
  const normalized = new URL(baseUrl);
  if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
    throw new TypeError("SCANNER_INTERNAL_BASE_URL must use http or https.");
  }
  return new URL("/internal/workflow/turn", normalized);
}

function boundedTimeout(value: number | undefined): number {
  const timeoutMs = value ?? 45_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 110_000) {
    throw new TypeError("Workflow runtime timeout must be between 1000 and 110000 milliseconds.");
  }
  return timeoutMs;
}

export async function executeDiagnosticTurn(
  rawInput: unknown,
  runtime: DiagnosticTurnRuntime,
  fetchImplementation: typeof fetch = fetch,
): Promise<DiagnosticTurnResult> {
  const input = parseDiagnosticTurnInput(rawInput);
  if (runtime.secret.length < 32) {
    throw new TypeError("INTERNAL_WORKFLOW_SECRET must contain at least 32 characters.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), boundedTimeout(runtime.timeoutMs));

  try {
    const response = await fetchImplementation(runtimeEndpoint(runtime.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtime.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Diagnostic runtime request failed with HTTP ${response.status}.`);
    }

    return parseRuntimeResult(await response.json(), input);
  } finally {
    clearTimeout(timer);
  }
}

export function runtimeFromEnvironment(environment: NodeJS.ProcessEnv = process.env): DiagnosticTurnRuntime {
  const baseUrl = environment.SCANNER_INTERNAL_BASE_URL;
  const secret = environment.INTERNAL_WORKFLOW_SECRET;
  if (!baseUrl || !secret) {
    throw new Error("SCANNER_INTERNAL_BASE_URL and INTERNAL_WORKFLOW_SECRET are required.");
  }

  const timeoutValue = environment.SCANNER_INTERNAL_TIMEOUT_MS;
  return {
    baseUrl,
    secret,
    ...(timeoutValue ? { timeoutMs: Number(timeoutValue) } : {}),
  };
}
