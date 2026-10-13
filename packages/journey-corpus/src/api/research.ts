// Give each new local attempt its own identity before contacting Render.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { researchAvailability } from "../config.js";
import { sendData, sendError } from "./http.js";
import type { DataStore } from "../core/ports.js";
import type { ResearchTaskInput, WorkflowRunner } from "../workflows/contract.js";
import { buildResearchInput, InvalidResearchInput } from "../workflows/input.js";
import { buildNhjAuditFromRecord } from "../db/nhjAuditFromDraft.js";
import { persistResearchDraft } from "../db/persistResearchDraft.js";
import {
  ResearchSubmissionExpired,
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

// Local mode keeps uncertain submissions only in this process. Production uses
// the durable ResearchClaim row so a server restart does not lose this identity.
const recentRunsLocal = new Map<string, { runId: string; at: number; key: string; input: ResearchTaskInput }>();

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

// An elapsed timer does not prove a task has stopped. Keep both accepted and
// uncertain attempts until polling confirms that the specific run has finished.
function recentSubmissionLocal(slug: string) {
  return recentRunsLocal.get(slug) ?? null;
}

// Match by run ID, not just platform, so an old status response cannot erase a
// newer attempt. Unknown submissions have no run ID and remain blocked for review.
function finishSubmissionLocal(runId: string) {
  for (const [slug, submission] of recentRunsLocal) {
    if (submission.runId === runId) recentRunsLocal.delete(slug);
  }
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
          // Recover with the saved input and timestamp, not a newly typed alias.
          const savedInput = { slug: claim.claim.slug, platform: claim.claim.platform };
          const { runId } = await runner.start(savedInput, `${claim.claim.slug}:${claim.claim.startedAt.toISOString()}`);
          await attachResearchRunId(input.slug, runId, prisma, claim.claim.startedAt);
          res.status(202);
          sendData(res, { runId, phase: "queued", slug: input.slug });
        } catch (err) {
          await failResearchClaim(input.slug, prisma, claim.claim.startedAt);
          console.error(`Research diagnostic: stage=workflow-start outcome=provider_error provider=render_workflows ${workflowStartFailureFields(err)}`);
          sendError(res, 502, "start_failed", "The submission was not confirmed. Retry to recover the same research task.");
        }
        return;
      } catch (error) {
        if (error instanceof ResearchSubmissionExpired) {
          sendError(res, 409, "submission_unknown", "The earlier submission is too old to retry safely. Ask an operator to check its Render task run.");
          return;
        }
        console.error("Research diagnostic: stage=claim outcome=store_error provider=postgres");
        sendError(res, 502, "start_failed", "The submission was not confirmed. Retry to recover the same research task.");
        return;
      }
    }

    // Local store: process-local dedupe only.
    const pending = recentSubmissionLocal(input.slug);
    if (pending?.runId) {
      res.status(202);
      sendData(res, { runId: pending.runId, phase: "running", slug: input.slug, deduplicated: true });
      return;
    }

    // Save the attempt before calling Render so a second browser request can
    // recover an accepted task whose reply was lost. This is process-local only.
    const submission = pending ?? { runId: "", at: Date.now(), key: randomUUID(), input };
    if (Date.now() - submission.at >= 24 * 60 * 60_000) {
      sendError(res, 409, "submission_unknown", "The earlier submission needs operator verification before another attempt.");
      return;
    }
    recentRunsLocal.set(input.slug, submission);
    try {
      const { runId } = await runner.start(submission.input, submission.key);
      submission.runId = runId;
      res.status(202);
      sendData(res, { runId, phase: "queued", slug: input.slug });
    } catch (err) {
      console.error(`Research diagnostic: stage=workflow-start outcome=provider_error provider=render_workflows ${workflowStartFailureFields(err)}`);
      sendError(res, 502, "start_failed", "The submission was not confirmed. Retry to recover the same research task.");
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
      // The adapter reports both Render failure and cancellation as "failed".
      // Only a confirmed terminal result releases local research for a new attempt.
      const terminal = projection.phase === "completed" || projection.phase === "failed";
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
        // Keep the accepted identity if saving the result fails, so a retry can
        // recover that result instead of starting the paid task again.
        if (!isPostgresStore(store)) finishSubmissionLocal(runId);
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
      if (terminal && isPostgresStore(store)) {
        try {
          // Save native failure/cancellation by run ID as well as task outcomes.
          // This releases only the matching claim and leaves newer attempts alone.
          if (
            projection.phase === "completed" && safeResult
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
      // Other terminal outcomes need no draft persistence. Release only their
      // matching local run; a late old response cannot erase its replacement.
      if (terminal && !isPostgresStore(store)) finishSubmissionLocal(runId);
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
