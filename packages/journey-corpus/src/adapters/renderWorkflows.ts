import { createWorkflowsClient } from "@renderinc/sdk/workflows";
import type {
  ResearchOutcome, ResearchTaskInput, RunPhase, RunStatusProjection, WorkflowRunner,
} from "../workflows/contract.js";
import type { VerifyOutcome } from "../core/runVerifyAudit.js";

type Client = ReturnType<typeof createWorkflowsClient>;

const KNOWN_OUTCOMES = new Set<ResearchOutcome["outcome"]>([
  "known", "no_docs", "invalid_output", "source_grounding_failed", "search_failed", "model_failed", "completed",
]);

const VERIFY_OUTCOMES = new Set<VerifyOutcome["outcome"]>([
  "not_found", "unchanged", "invalid_output", "search_failed", "model_failed", "completed",
]);

/** Coerce a raw task result into a ResearchOutcome, or null if unrecognizable. */
export function coerceOutcome(raw: unknown): ResearchOutcome | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as { outcome?: unknown; assessment?: unknown; audit?: unknown };
  if (typeof obj.outcome !== "string" || !KNOWN_OUTCOMES.has(obj.outcome as ResearchOutcome["outcome"])) return null;
  // Verify completed also uses outcome:"completed" but carries audit, not assessment.
  if (obj.outcome === "completed" && obj.audit && !obj.assessment) return null;
  return raw as ResearchOutcome;
}

export function coerceVerifyOutcome(raw: unknown): VerifyOutcome | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as { outcome?: unknown; audit?: unknown; assessment?: unknown };
  if (typeof obj.outcome !== "string" || !VERIFY_OUTCOMES.has(obj.outcome as VerifyOutcome["outcome"])) return null;
  if (obj.outcome === "completed" && obj.assessment && !obj.audit) return null;
  if (obj.outcome === "completed" && !obj.audit) return null;
  return raw as VerifyOutcome;
}

/**
 * Map a raw Workflow run detail into a browser-safe projection. Never surfaces
 * the raw task input, Render/provider credentials, or raw upstream error text:
 * failed runs get a generic, user-safe message.
 */
export function projectRun(runId: string, details: {
  status?: string;
  retries?: number;
  results?: unknown[];
}): RunStatusProjection {
  const status = details.status ?? "pending";
  const retries = typeof details.retries === "number" ? details.retries : 0;

  let phase: RunPhase;
  let result: ResearchOutcome | VerifyOutcome | null = null;
  let message: string | null = null;

  switch (status) {
    case "pending":
      phase = retries > 0 ? "retrying" : "queued";
      break;
    case "running":
    case "paused":
      phase = retries > 0 ? "retrying" : "running";
      break;
    case "succeeded":
    case "completed": {
      const research = coerceOutcome(details.results?.[0]);
      const verify = coerceVerifyOutcome(details.results?.[0]);
      result = research ?? verify;
      if (result) {
        phase = "completed";
      } else {
        phase = "failed";
        message = "The run finished but returned no usable result.";
      }
      break;
    }
    case "canceled":
      phase = "failed";
      message = "The run was canceled.";
      break;
    case "failed":
    default:
      phase = "failed";
      message = "The run could not be completed. This is usually a temporary provider or infrastructure issue. Try again.";
      break;
  }

  return { runId, phase, result, message };
}

/**
 * WorkflowRunner backed by the Render SDK. Holds the server-side Render API key
 * (via RENDER_API_KEY) and never exposes it. Reads runs by id and returns only
 * a safe projection.
 */
export class RenderWorkflowRunner implements WorkflowRunner {
  private readonly client: Client;

  constructor(
    private readonly taskSlug: string,
    apiKey: string,
  ) {
    if (!taskSlug) throw new Error("RenderWorkflowRunner requires a task slug.");
    this.client = createWorkflowsClient({ token: apiKey });
  }

  async start(input: ResearchTaskInput): Promise<{ runId: string }> {
    const run = await this.client.startTask(this.taskSlug, [input]);
    return { runId: run.taskRunId };
  }

  async startNamedTask(taskSlug: string, input: unknown): Promise<{ runId: string }> {
    const run = await this.client.startTask(taskSlug, [input]);
    return { runId: run.taskRunId };
  }

  async status(runId: string): Promise<RunStatusProjection> {
    const details = await this.client.getTaskRun(runId);
    return projectRun(runId, details as unknown as { status?: string; retries?: number; results?: unknown[] });
  }
}
