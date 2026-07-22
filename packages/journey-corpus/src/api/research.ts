import type { Request, Response } from "express";
import { config, researchConfigStatus } from "../config.js";
import { sendError } from "./http.js";
import { runResearch, type ResearchDeps } from "../core/researchPipeline.js";

const RESEARCH_WINDOW_MS = 60 * 60 * 1_000;
const RESEARCH_LIMIT = 3;
const attemptsByIp = new Map<string, number[]>();

function takeResearchSlot(ip: string, now = Date.now()): boolean {
  const cutoff = now - RESEARCH_WINDOW_MS;
  const recent = (attemptsByIp.get(ip) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= RESEARCH_LIMIT) {
    attemptsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  attemptsByIp.set(ip, recent);
  return true;
}

/**
 * Phase 2 endpoint: research a platform that is not in the dataset and stream
 * progress over Server-Sent Events. Gated by RESEARCH_ENABLED and by whether the
 * search/LLM providers are configured. Each pipeline event is one SSE message.
 */
export function startResearch(deps: ResearchDeps | null) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!config.researchEnabled) {
      const status = researchConfigStatus();
      sendError(res, 503, "research_disabled", `Live research is not configured on this deployment. Set ${status.missing.join(", ")}.`);
      return;
    }
    if (!deps) {
      const status = researchConfigStatus();
      sendError(res, 503, "research_unconfigured", `Live research is enabled but missing ${status.missing.join(", ")}.`);
      return;
    }
    const platform = typeof req.body?.platform === "string" ? req.body.platform.trim() : "";
    if (!platform) {
      sendError(res, 400, "bad_request", "Provide a platform name.");
      return;
    }
    if (platform.length > 100 || !/^[\p{L}\p{N} .&+'()_/:\-]+$/u.test(platform)) {
      sendError(res, 400, "bad_request", "Use a platform name of 100 characters or fewer.");
      return;
    }
    if (!takeResearchSlot(req.ip ?? "unknown")) {
      sendError(res, 429, "rate_limited", "This connection has started three research jobs in the last hour. Try again later.");
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Detect a real client disconnect via the response socket closing before we
    // finished writing. (req "close" is unreliable: it fires once the request
    // body has been consumed, not when the client goes away.)
    let aborted = false;
    res.on("close", () => {
      if (!res.writableEnded) aborted = true;
    });
    const send = (event: string, data: unknown): void => {
      if (!aborted && !res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      await runResearch(platform, deps, (ev) => send(ev.type, ev));
    } catch (err) {
      console.error("Research stream error:", err);
      send("error", { type: "error", code: "internal", message: "Research failed unexpectedly." });
    } finally {
      if (!res.writableEnded) res.end();
    }
  };
}
