import type { LLMProvider, DocHit, RepoWriter } from "../core/ports.js";
import { SchemaRepairError } from "../adapters/openRouter.js";
import { GitHubApiError } from "../adapters/githubPr.js";
import type { ContributionResult, ReconstructResult } from "./contract.js";

/**
 * Reconstruct a record and classify the outcome. A deterministic
 * schema-repair failure becomes a terminal `invalid_output` result (never
 * retried). Any other failure (network, timeout, provider 5xx) is transient and
 * rethrown so the task boundary retries it. This is the single classification
 * used by both the Workflow subtask and the direct (test/local) path.
 */
export async function reconstructWithClassification(
  llm: LLMProvider,
  platform: string,
  docs: DocHit[],
): Promise<ReconstructResult> {
  try {
    const record = await llm.reconstructRecord(platform, docs);
    return { status: "ok", record };
  } catch (err) {
    if (err instanceof SchemaRepairError) {
      return { status: "invalid_output", message: err.message };
    }
    throw err;
  }
}

const NO_TOKEN_REASON =
  "Automatic contribution is off (no GITHUB_TOKEN configured). The drafted record is shown below for manual submission.";

/**
 * Open a draft contribution and classify the outcome. A permanent GitHub error
 * (permission, missing repo, validation) becomes a terminal `skipped` result:
 * research still succeeds and the draft is shown for manual submission. A
 * transient GitHub error is rethrown so the task boundary retries it. The
 * writer itself is idempotent, so retries never open a duplicate PR.
 */
export async function draftWithClassification(
  repo: RepoWriter | undefined,
  record: import("../core/ports.js").PlatformRecord,
): Promise<ContributionResult> {
  if (!repo) return { status: "skipped", reason: NO_TOKEN_REASON };
  try {
    const { url, reused } = await repo.openDraftRecordPR(record);
    return { status: "opened", url, reused };
  } catch (err) {
    if (err instanceof GitHubApiError && err.transient) throw err;
    const detail = err instanceof GitHubApiError ? ` (${err.status})` : "";
    return {
      status: "skipped",
      reason: `Could not open a draft contribution automatically${detail}. The drafted record is shown below for manual submission.`,
    };
  }
}
