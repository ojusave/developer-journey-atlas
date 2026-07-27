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
  cleanupResearchClaims,
  completeResearchClaim,
  completeResearchClaimByRunId,
  countRecentResearchStarts,
  failResearchClaim,
  failResearchClaimByRunId,
} from "../db/researchClaims.js";
import { selectedPathRow } from "../../lib/measure.mjs";
import { ensureRow, isPostgresStore } from "./storeHelpers.js";
import type { PlatformRecord } from "../core/ports.js";
import { buildComplexityProfileFromRecord } from "../core/complexityProfile.js";

const RESEARCH_WINDOW_MS = 60 * 60 * 1_000;
const RESEARCH_GLOBAL_LIMIT = Math.max(
  1,
  Number(process.env.RESEARCH_GLOBAL_HOURLY_LIMIT ?? 300),
);

// Local-only fallback when DATA_STORE=local (no ResearchClaim table usage).
const DEDUPE_TTL_MS = 10 * 60 * 1_000;
const recentRunsLocal = new Map<string, { runId: string; at: number }>();

function browserSafeDraft(record: PlatformRecord) {
  return {
    name: record.platform.name,
    slug: record.platform.slug,
    startingUrl: record.entry_point?.starting_url ?? null,
    firstSuccess:
      record.documented_first_success?.normalized_outcome
      ?? record.documented_first_success?.official_milestone
      ?? "First documented API success",
    successSignal: record.documented_first_success?.observable_completion_signal ?? null,
    prerequisites: (record.prerequisites ?? []).slice(0, 12).map((item) => ({
      requirement: item.requirement,
      required: item.required,
    })),
    steps: (record.primary_path ?? []).slice(0, 30).map((step) => ({
      stepNumber: step.step_number,
      action: step.action,
      successSignal: step.success_signal ?? null,
      requiredFields: (step.required_fields ?? []).map((field) => ({
        label: field.label,
        type: field.fieldType,
        required: field.required,
      })),
    })),
    frictionGates: (record.friction_gates ?? []).slice(0, 20).map((gate) => ({
      atStep: gate.at_step ?? null,
      type: gate.type ?? "other",
      description: gate.description ?? gate.requirement ?? "",
    })),
    complexity: buildComplexityProfileFromRecord(record),
    sources: (record.sources ?? []).slice(0, 12).map((source) => ({
      title: source.title,
      url: source.url,
      accessedAt: source.accessed_at ?? null,
    })),
  };
}

function browserSafeResearchResult(result: unknown): unknown {
  if (!result || typeof result !== "object" || !("outcome" in result)) return null;
  const value = result as { outcome: string; slug?: string; candidates?: unknown[]; message?: string };
  switch (value.outcome) {
    case "known":
      return { outcome: "known", slug: value.slug };
    case "identity_ambiguous":
      return { outcome: "identity_ambiguous", candidates: value.candidates ?? [] };
    case "identity_unresolved":
    case "no_official_source":
      return { outcome: value.outcome };
    case "official_source_unusable":
      return {
        outcome: value.outcome,
        message: "The official source pages did not contain usable retrieved content.",
      };
    case "invalid_output":
      return {
        outcome: value.outcome,
        message: "The documentation could not be turned into a complete, internally consistent setup guide.",
      };
    case "claim_grounding_failed":
      return {
        outcome: value.outcome,
        message: "At least one required action was not supported by the accepted official documentation.",
      };
    case "search_failed":
      return {
        outcome: value.outcome,
        message: "Official-source discovery was unavailable. Try again later.",
      };
    case "model_failed":
      return {
        outcome: value.outcome,
        message: "Route reconstruction was unavailable. Try again later.",
      };
    case "review_required":
      return {
        outcome: value.outcome,
        slug: value.slug,
        message: "Research finished and remains private until maintainer review passes every publication gate.",
      };
    default:
      return null;
  }
}

function workflowStartFailureFields(err: unknown): string {
  if (!err || typeof err !== "object") return "error=unknown";
  const value = err as { name?: unknown; statusCode?: unknown };
  const name = typeof value.name === "string" ? value.name : "unknown";
  const statusCode = typeof value.statusCode === "number" ? value.statusCode : "unknown";
  return `error=${name} statusCode=${statusCode}`;
}

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
}, runId: string): Promise<void> {
  if (!isPostgresStore(store)) return;
  const prisma = store.getPrisma();
  const row = selectedPathRow(result.record);
  const audit = buildNhjAuditFromRecord(result.record);
  await persistResearchDraft(result.record, row, { prisma, audit });
  store.ingestLive(result.record, row, audit);
  await completeResearchClaim(result.slug, prisma);
  await completeResearchClaimByRunId(runId, prisma);
  console.log(`Persisted research draft for ${result.slug} into Postgres.`);
}

/**
 * Start or refresh research for a platform. Validates and rate-limits,
 * short-circuits only public reviewed platforms, then starts a durable Workflow
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

    // Reuse only public reviewed records before touching Workflow. A committed
    // corpus row is not proof that the atomic journey has been reconstructed.
    const known = await ensureRow(store, input.slug);
    if (known && store.isPublicEligible(input.slug)) {
      sendData(res, { known: true, slug: input.slug }, { status: 200 });
      return;
    }

    if (isPostgresStore(store)) {
      const prisma = store.getPrisma();
      try {
        await cleanupResearchClaims(prisma);
        const globalStarts = await countRecentResearchStarts(prisma, RESEARCH_WINDOW_MS);
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
          { slug: input.slug, platform: input.platform },
          prisma,
        );

        if (claim.kind === "existing") {
          if (claim.claim.status === "completed") {
            const loaded = await ensureRow(store, input.slug);
            if (loaded && store.isPublicEligible(input.slug)) {
              sendData(res, { known: true, slug: input.slug }, { status: 200 });
              return;
            }
            const existingDraft = store.getRecord(input.slug);
            if (existingDraft) {
              sendData(res, {
                result: {
                  outcome: "draft_ready",
                  slug: input.slug,
                  draft: browserSafeDraft(existingDraft),
                  message: "Using the saved private research draft.",
                },
              }, { status: 200 });
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
            { slug: input.slug, platform: input.platform },
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
          console.error(`Research diagnostic: stage=workflow-start outcome=provider_error provider=render_workflows ${workflowStartFailureFields(err)}`);
          sendError(res, 502, "start_failed", "Could not start research right now. Try again shortly.");
        }
        return;
      } catch {
        console.error("Research diagnostic: stage=claim outcome=store_error provider=postgres");
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
      console.error(`Research diagnostic: stage=workflow-start outcome=provider_error provider=render_workflows ${workflowStartFailureFields(err)}`);
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
          await persistCompletedResearch(store, projection.result, runId);
        } catch {
          console.error("Research diagnostic: stage=persist outcome=store_error provider=postgres");
          sendError(res, 502, "persistence_failed", "Research finished, but the private review record could not be stored.");
          return;
        }
        sendData(res, {
          ...projection,
          result: {
            outcome: "draft_ready",
            slug: projection.result.slug,
            draft: browserSafeDraft(projection.result.record),
            message: "Research finished. This draft stays private until maintainer review.",
          },
        });
        return;
      }
      const safeResult = browserSafeResearchResult(projection.result);
      if (projection.phase === "completed" && isPostgresStore(store)) {
        try {
          if (
            safeResult
            && typeof safeResult === "object"
            && "outcome" in safeResult
            && (safeResult.outcome === "known" || safeResult.outcome === "review_required")
          ) {
            await completeResearchClaimByRunId(runId, store.getPrisma());
          } else {
            await failResearchClaimByRunId(runId, store.getPrisma());
          }
        } catch {
          console.error("Research diagnostic: stage=claim-terminal outcome=store_error provider=postgres");
        }
      }
      sendData(res, {
        ...projection,
        result: safeResult,
        message:
          projection.phase === "completed" && projection.result && !safeResult
            ? "This run is not a public research result."
            : projection.message,
      });
    } catch {
      console.error("Research diagnostic: stage=workflow-status outcome=not_found provider=render_workflows");
      sendError(res, 404, "run_not_found", "That research run could not be found.");
    }
  };
}
