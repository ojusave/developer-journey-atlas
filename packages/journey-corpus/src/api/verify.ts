import type { Request, Response } from "express";
import { researchAvailability } from "../config.js";
import { sendData, sendError } from "./http.js";
import type { DataStore } from "../core/ports.js";
import type { WorkflowRunner } from "../workflows/contract.js";

const VERIFY_WINDOW_MS = 60 * 60 * 1_000;
const VERIFY_LIMIT = Math.max(1, Number(process.env.VERIFY_HOURLY_LIMIT ?? 30));
const attemptsByIp = new Map<string, number[]>();
const DEDUPE_TTL_MS = 15 * 60 * 1_000;
const recentRuns = new Map<string, { runId: string; at: number }>();

function verifyTaskSlug(): string {
  return process.env.RENDER_VERIFY_TASK_SLUG
    || "developer-journey-atlas-workflows/verifyPlatformAudit";
}

function takeSlot(ip: string, now = Date.now()): boolean {
  const cutoff = now - VERIFY_WINDOW_MS;
  const recent = (attemptsByIp.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= VERIFY_LIMIT) {
    attemptsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  attemptsByIp.set(ip, recent);
  return true;
}

/**
 * Start durable audit verification for a known platform. Returns 202 + runId.
 */
export function startVerify(store: DataStore, runner: WorkflowRunner | null) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!runner) {
      const status = researchAvailability();
      sendError(
        res,
        503,
        "verify_unconfigured",
        `Verification Workflows are not configured. Set ${status.missing.join(", ")} (same Render API wiring as research).`,
      );
      return;
    }

    const slug = String(req.body?.slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
      sendError(res, 400, "bad_request", "Provide a valid platform slug.");
      return;
    }
    if (!store.getRow(slug)) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }

    const checkOnly = Boolean(req.body?.checkOnly);
    const dedupeKey = `${slug}:${checkOnly ? "check" : "full"}`;
    const prior = recentRuns.get(dedupeKey);
    if (prior && Date.now() - prior.at < DEDUPE_TTL_MS) {
      res.status(202);
      sendData(res, { runId: prior.runId, phase: "running", slug, deduplicated: true });
      return;
    }

    if (!takeSlot(req.ip ?? "unknown")) {
      sendError(res, 429, "rate_limited", `Verify rate limit (${VERIFY_LIMIT}/hour) exceeded.`);
      return;
    }

    try {
      const { runId } = await runner.startNamedTask(verifyTaskSlug(), { slug, checkOnly });
      recentRuns.set(dedupeKey, { runId, at: Date.now() });
      res.status(202);
      sendData(res, { runId, phase: "queued", slug, checkOnly });
    } catch (err) {
      console.error("Failed to start verify run:", err);
      sendError(res, 502, "start_failed", "Could not start verification right now.");
    }
  };
}

/** Poll verify run status (same safe projection as research). */
export function getVerifyStatus(runner: WorkflowRunner | null) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!runner) {
      sendError(res, 503, "verify_unconfigured", "Verification Workflows are not configured.");
      return;
    }
    const runId = String(req.params.runId ?? "");
    if (!/^[a-zA-Z0-9._:-]{6,128}$/.test(runId)) {
      sendError(res, 400, "bad_request", "Invalid run id.");
      return;
    }
    try {
      const projection = await runner.status(runId);
      sendData(res, projection);
    } catch (err) {
      console.error("Failed to read verify run:", err);
      sendError(res, 404, "not_found", "No verification run found for that id.");
    }
  };
}
