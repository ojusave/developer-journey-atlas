import type { Request, Response } from "express";
import { researchAvailability } from "../config.js";
import { sendData, sendError } from "./http.js";
import type { DataStore } from "../core/ports.js";
import type { WorkflowRunner } from "../workflows/contract.js";
import { buildResearchInput, InvalidResearchInput } from "../workflows/input.js";
import { buildNhjAuditFromRecord } from "../db/nhjAuditFromDraft.js";
import { persistResearchDraft } from "../db/persistResearchDraft.js";
import {
  attachResearchRunId,
  beginResearchClaim,
  completeResearchClaim,
  countRecentResearchStarts,
  failResearchClaim,
} from "../db/researchClaims.js";
import { selectedPathRow } from "../../lib/measure.mjs";
import { ensureRow, isPostgresStore } from "./storeHelpers.js";

const RESEARCH_WINDOW_MS = 60 * 60 * 1_000;
const RESEARCH_LIMIT = Math.max(1, Number(process.env.RESEARCH_HOURLY_LIMIT ?? 60));
const RESEARCH_GLOBAL_LIMIT = Math.max(
  RESEARCH_LIMIT,
  Number(process.env.RESEARCH_GLOBAL_HOURLY_LIMIT ?? 300),
);

// Local-only fallback when DATA_STORE=local (no ResearchClaim table usage).
const DEDUPE_TTL_MS = 10 * 60 * 1_000;
const recentRunsLocal = new Map<string, { runId: string; at: number }>();

function recentRunLocal(slug: string, now = Date.now()): string | null {
  const hit = recentRunsLocal.get(slug);
  if (hit && now - hit.at < DEDUPE_TTL_MS) return hit.runId;
  if (hit) recentRunsLocal.delete(slug);
  return null;
}

async function persistCompletedResearch(store: DataStore, result: {
  outcome: "completed";
  slug: string;
  record: import("../core/ports.js").PlatformRecord;
  assessment: unknown;
}): Promise<void> {
  if (!isPostgresStore(store)) return;
  const prisma = store.getPrisma();
  if (store.getRow(result.slug) && store.getRecord(result.slug)) {
    await completeResearchClaim(result.slug, prisma);
    return;
  }
  const row = selectedPathRow(result.record);
  const audit = buildNhjAuditFromRecord(result.record);
  await persistResearchDraft(result.record, row, { prisma, audit });
  store.ingestLive(result.record, row, audit);
  await completeResearchClaim(result.slug, prisma);
  console.log(`Persisted research draft for ${result.slug} into Postgres.`);
}

/**
 * Start research for a platform that is not in the Atlas. Validates and
 * rate-limits, short-circuits known platforms, then starts a durable Workflow
 * run and returns 202 with a run id immediately. Concurrent developers who
 * request the same slug share one Workflow via ResearchClaim in Postgres.
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

    // Known platforms never hit the Workflow (including ones persisted by another instance).
    const known = await ensureRow(store, input.slug);
    if (known) {
      sendData(res, { known: true, slug: input.slug }, { status: 200 });
      return;
    }

    const clientIp = req.ip ?? null;

    if (isPostgresStore(store)) {
      const prisma = store.getPrisma();
      try {
        const [ipStarts, globalStarts] = await Promise.all([
          countRecentResearchStarts(prisma, RESEARCH_WINDOW_MS, { clientIp }),
          countRecentResearchStarts(prisma, RESEARCH_WINDOW_MS),
        ]);
        if (ipStarts >= RESEARCH_LIMIT) {
          sendError(
            res,
            429,
            "rate_limited",
            `This connection has started ${RESEARCH_LIMIT} research jobs in the last hour. Try again later.`,
          );
          return;
        }
        if (globalStarts >= RESEARCH_GLOBAL_LIMIT) {
          sendError(
            res,
            429,
            "rate_limited",
            `The Atlas has reached its shared research capacity for this hour. Try again later.`,
          );
          return;
        }

        const claim = await beginResearchClaim(
          { slug: input.slug, platform: input.platform, clientIp },
          prisma,
        );

        if (claim.kind === "existing") {
          if (claim.claim.status === "completed") {
            const loaded = await ensureRow(store, input.slug);
            if (loaded) {
              sendData(res, { known: true, slug: input.slug }, { status: 200 });
              return;
            }
          }
          if (claim.claim.runId) {
            res.status(202);
            sendData(res, {
              runId: claim.claim.runId,
              phase: "running",
              slug: input.slug,
              deduplicated: true,
              resumed: true,
            });
            return;
          }
          // Another request is mid-start (claiming without runId yet): wait briefly then re-read.
          await new Promise((resolve) => setTimeout(resolve, 400));
          const again = await beginResearchClaim(
            { slug: input.slug, platform: input.platform, clientIp },
            prisma,
          );
          if (again.kind === "existing" && again.claim.runId) {
            res.status(202);
            sendData(res, {
              runId: again.claim.runId,
              phase: "running",
              slug: input.slug,
              deduplicated: true,
              resumed: true,
            });
            return;
          }
          sendError(res, 409, "claim_in_progress", "Another request is starting this research. Retry in a moment.");
          return;
        }

        try {
          const { runId } = await runner.start(input);
          await attachResearchRunId(input.slug, runId, prisma);
          res.status(202);
          sendData(res, { runId, phase: "queued", slug: input.slug });
        } catch (err) {
          await failResearchClaim(input.slug, prisma);
          console.error("Failed to start research run:", err);
          sendError(res, 502, "start_failed", "Could not start research right now. Try again shortly.");
        }
        return;
      } catch (err) {
        console.error("Research claim failed:", err);
        sendError(res, 502, "start_failed", "Could not start research right now. Try again shortly.");
        return;
      }
    }

    // Local store: process-local dedupe only.
    const existingRunId = recentRunLocal(input.slug);
    if (existingRunId) {
      res.status(202);
      sendData(res, { runId: existingRunId, phase: "running", slug: input.slug, deduplicated: true });
      return;
    }

    try {
      const { runId } = await runner.start(input);
      recentRunsLocal.set(input.slug, { runId, at: Date.now() });
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
 * projection. When a run completes, the draft is written to Postgres so every
 * instance can serve it on the next request.
 */
export function getResearchStatus(store: DataStore, runner: WorkflowRunner | null) {
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
      if (
        projection.phase === "completed" &&
        projection.result &&
        projection.result.outcome === "completed" &&
        "record" in projection.result &&
        projection.result.record
      ) {
        try {
          await persistCompletedResearch(store, projection.result);
        } catch (err) {
          console.error("Failed to persist completed research:", err);
        }
      }
      sendData(res, projection);
    } catch (err) {
      console.error("Failed to read research run:", err);
      sendError(res, 404, "run_not_found", "That research run could not be found.");
    }
  };
}
