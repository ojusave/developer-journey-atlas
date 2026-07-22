import type { Request, Response } from "express";
import { researchAvailability } from "../config.js";
import { sendData, sendError } from "./http.js";
import type { DataStore } from "../core/ports.js";
import type { WorkflowRunner } from "../workflows/contract.js";
import { buildResearchInput, InvalidResearchInput } from "../workflows/input.js";

const RESEARCH_WINDOW_MS = 60 * 60 * 1_000;
const RESEARCH_LIMIT = Math.max(1, Number(process.env.RESEARCH_HOURLY_LIMIT ?? 60));
const attemptsByIp = new Map<string, number[]>();

// Per-platform duplicate-submission guard: a recently started run for the same
// normalized slug is reused instead of starting a new one. Bounded in-memory,
// which is enough because the Workflow itself is durable and the GitHub
// contribution is idempotent even across web-service restarts.
const DEDUPE_TTL_MS = 10 * 60 * 1_000;
const recentRuns = new Map<string, { runId: string; at: number }>();

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

function recentRunFor(slug: string, now = Date.now()): string | null {
  const hit = recentRuns.get(slug);
  if (hit && now - hit.at < DEDUPE_TTL_MS) return hit.runId;
  if (hit) recentRuns.delete(slug);
  return null;
}

/**
 * Start research for a platform that is not in the Atlas. Validates and
 * rate-limits, short-circuits known platforms, then starts a durable Workflow
 * run and returns 202 with a run id immediately. The research continues even if
 * the browser disconnects or this request ends.
 */
export function startResearch(store: DataStore, runner: WorkflowRunner | null) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!runner) {
      const status = researchAvailability();
      sendError(res, 503, "research_unconfigured", `Live research is not configured on this deployment. Set ${status.missing.join(", ")}.`);
      return;
    }

    let input;
    try {
      input = buildResearchInput(req.body?.platform);
    } catch (err) {
      const message = err instanceof InvalidResearchInput ? err.message : "Provide a platform name.";
      sendError(res, 400, "bad_request", message);
      return;
    }

    // Known platforms never hit the Workflow: return the existing record directly.
    if (store.getRow(input.slug)) {
      sendData(res, { known: true, slug: input.slug }, { status: 200 });
      return;
    }

    const existingRunId = recentRunFor(input.slug);
    if (existingRunId) {
      res.status(202);
      sendData(res, { runId: existingRunId, phase: "running", slug: input.slug, deduplicated: true });
      return;
    }

    if (!takeResearchSlot(req.ip ?? "unknown")) {
      sendError(
        res,
        429,
        "rate_limited",
        `This connection has started ${RESEARCH_LIMIT} research jobs in the last hour. Try again later.`,
      );
      return;
    }

    try {
      const { runId } = await runner.start(input);
      recentRuns.set(input.slug, { runId, at: Date.now() });
      res.status(202);
      sendData(res, { runId, phase: "queued", slug: input.slug });
    } catch (err) {
      console.error("Failed to start research run:", err);
      sendError(res, 502, "start_failed", "Could not start research right now. Try again shortly.");
    }
  };
}

/**
 * Read the server-side status of a Workflow run and return a browser-safe
 * projection. Never returns Render or provider credentials, raw upstream errors,
 * or the run's raw task input. The browser can reload and resume with the run id.
 */
export function getResearchStatus(runner: WorkflowRunner | null) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!runner) {
      sendError(res, 503, "research_unconfigured", "Live research is not configured on this deployment.");
      return;
    }
    const runId = typeof req.params.runId === "string" ? req.params.runId.trim() : "";
    if (!runId || !/^[A-Za-z0-9._-]{1,128}$/.test(runId)) {
      sendError(res, 400, "bad_request", "Provide a valid run id.");
      return;
    }
    try {
      const projection = await runner.status(runId);
      sendData(res, projection);
    } catch (err) {
      console.error("Failed to read research run:", err);
      sendError(res, 404, "run_not_found", "That research run could not be found.");
    }
  };
}
