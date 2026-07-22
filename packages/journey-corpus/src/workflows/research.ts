import { task } from "@renderinc/sdk/workflows";

import type { DocHit, PlatformRecord } from "../core/ports.js";
import { runResearchPipeline } from "../core/researchPipeline.js";
import { reconstructWithClassification, draftWithClassification } from "./classify.js";
import { parseResearchTaskInput } from "./input.js";
import { buildRow, getLLMProvider, getRepoWriter, getSearchProvider, getStore } from "./deps.js";
import type { ContributionResult, ReconstructResult, ResearchOutcome, ResearchSteps } from "./contract.js";
import { linkPlatformBlockersTask } from "./linkBlockers.js";
import {
  verifyPlatformAudit,
  verifyAuditBatch,
  refreshAuditEvidence,
  proposeAuditRevision,
  draftAuditContribution,
} from "./verifyAudit.js";

export {
  linkPlatformBlockersTask,
  verifyPlatformAudit,
  verifyAuditBatch,
  refreshAuditEvidence,
  proposeAuditRevision,
  draftAuditContribution,
};

/**
 * Search official documentation for a platform. Independently retryable: a
 * transient search-provider failure throws and is retried at this boundary.
 * Zero results is a deterministic outcome, returned (not thrown) so the parent
 * can classify it as "no docs" without wasting retries.
 */
export const searchOfficialDocs = task(
  {
    name: "searchOfficialDocs",
    plan: "starter",
    timeoutSeconds: 90,
    retry: { maxRetries: 2, waitDurationMs: 2_000, backoffScaling: 2 },
  },
  async function searchOfficialDocs(input: { platform: string }): Promise<DocHit[]> {
    return getSearchProvider().findOfficialDocs(input.platform);
  },
);

/**
 * Reconstruct and validate a schema-valid record from the official docs.
 * Independently retryable for transient model failures. A schema-repair failure
 * after the bounded repair policy is deterministic and returned as
 * `invalid_output`, never retried.
 */
export const reconstructRecord = task(
  {
    name: "reconstructRecord",
    plan: "standard",
    timeoutSeconds: 300,
    retry: { maxRetries: 1, waitDurationMs: 5_000, backoffScaling: 2 },
  },
  async function reconstructRecord(input: { platform: string; docs: DocHit[] }): Promise<ReconstructResult> {
    return reconstructWithClassification(getLLMProvider(), input.platform, input.docs);
  },
);

/**
 * Create a human-gated draft PR for the record. Idempotent: the branch identity
 * is deterministic and an already-open PR is reused, so retries never open a
 * duplicate. A permanent GitHub failure is returned as `skipped`; a transient
 * one throws and is retried here.
 */
export const draftContribution = task(
  {
    name: "draftContribution",
    plan: "starter",
    timeoutSeconds: 120,
    retry: { maxRetries: 2, waitDurationMs: 3_000, backoffScaling: 2 },
  },
  async function draftContribution(input: { record: PlatformRecord }): Promise<ContributionResult> {
    return draftWithClassification(getRepoWriter(), input.record);
  },
);

const steps: ResearchSteps = {
  searchDocs: async (input) => searchOfficialDocs(input),
  reconstructRecord: async (input) => reconstructRecord(input),
  // GitHub draft PRs are not used for live research; keep a no-op so the
  // ResearchSteps contract stays stable for tests and older callers.
  draftContribution: async () => ({
    status: "skipped",
    reason: "Draft shown in the Atlas; no GitHub contribution step.",
  }),
};

/**
 * Parent orchestration and stable public entry point. Validates the input,
 * short-circuits known platforms, then chains the search, reconstruction, and
 * contribution subtasks and returns one bounded terminal outcome. The parent
 * itself is not retried: each subtask owns its retry policy, and deterministic
 * failures are returned as terminal results.
 */
export const researchPlatform = task(
  {
    name: "researchPlatform",
    plan: "starter",
    timeoutSeconds: 600,
  },
  async function researchPlatform(rawInput: unknown): Promise<ResearchOutcome> {
    const input = parseResearchTaskInput(rawInput);
    return runResearchPipeline(input, steps, { store: getStore(), buildRow });
  },
);
