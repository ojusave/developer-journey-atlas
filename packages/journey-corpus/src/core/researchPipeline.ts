import type {
  DataStore, DocHit, LLMProvider, MetricRow, PlatformRecord, RepoWriter, SearchProvider,
} from "./ports.js";
import { buildAssessment } from "./assessment.js";
import { buildDocumentedOnboardingLoad } from "./onboardingLoad.js";
import type { ContributionResult, ResearchOutcome, ResearchSteps, ResearchTaskInput } from "../workflows/contract.js";
import { draftWithClassification, reconstructWithClassification } from "../workflows/classify.js";

/** Read-only context the orchestration needs beyond the injectable steps. */
export interface ResearchContext {
  store: DataStore;
  /** Bridge to the shared measurement contract (selectedPathRow). */
  buildRow: (record: PlatformRecord) => MetricRow;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error.";
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

/** Every cited source URL must have been returned by the official-docs search. */
export function validateSourceGrounding(record: PlatformRecord, docs: Array<{ url: string }>): string | null {
  const searchedUrls = new Set(docs.map((doc) => normalizedUrl(doc.url)));
  const unsupported = (record.sources ?? []).filter((source) => !searchedUrls.has(normalizedUrl(source.url)));
  if (unsupported.length > 0) {
    return `The draft cited ${unsupported.length} source URL${unsupported.length === 1 ? "" : "s"} that were not returned by the official-docs search.`;
  }
  return null;
}

/**
 * Orchestrate live research for an unknown platform, returning one bounded,
 * terminal outcome. Transient failures inside a step throw and are handled by
 * that step's retry policy at the task boundary; when a step's retries are
 * exhausted the orchestration catches it and returns a user-safe terminal
 * reason rather than crashing the run. Deterministic outcomes (known platform,
 * no docs, invalid model output, source-grounding failure) are returned
 * directly and are never retried.
 *
 * The same function runs durably on Render (steps are chained subtasks) and
 * inline in tests (steps are fakes): there is one orchestration, not two.
 */
export async function runResearchPipeline(
  input: ResearchTaskInput,
  steps: ResearchSteps,
  ctx: ResearchContext,
): Promise<ResearchOutcome> {
  const { slug, platform } = input;

  if (slug && ctx.store.getRow(slug)) {
    return { outcome: "known", slug };
  }

  let docs: DocHit[];
  try {
    docs = await steps.searchDocs({ platform });
  } catch (err) {
    return { outcome: "search_failed", message: safeMessage(err) };
  }
  if (docs.length === 0) {
    return { outcome: "no_docs" };
  }

  let reconstruct;
  try {
    reconstruct = await steps.reconstructRecord({ platform, docs });
  } catch (err) {
    return { outcome: "model_failed", message: safeMessage(err) };
  }
  if (reconstruct.status === "invalid_output") {
    return { outcome: "invalid_output", message: reconstruct.message };
  }
  const record = reconstruct.record;

  const groundingError = validateSourceGrounding(record, docs);
  if (groundingError) {
    return { outcome: "source_grounding_failed", message: groundingError };
  }

  const row = ctx.buildRow(record);
  const assessment = buildAssessment(row, record, buildDocumentedOnboardingLoad(row, ctx.store));

  let contribution: ContributionResult;
  if (record.research_status !== "complete") {
    contribution = {
      status: "skipped",
      reason: `Record marked "${record.research_status}", so no automatic contribution was opened. Review it before submitting.`,
    };
  } else {
    try {
      contribution = await steps.draftContribution({ record });
    } catch {
      contribution = {
        status: "skipped",
        reason: "The contribution service was unavailable. The drafted record is shown below for manual submission.",
      };
    }
  }

  return { outcome: "completed", slug: record.platform.slug, record, assessment, contribution };
}

/**
 * Wrap concrete adapters into the injectable step shape. Used by the direct
 * (non-Workflow) path and by tests. The Workflow entry provides its own steps
 * that run each adapter inside a chained subtask.
 */
export function stepsFromAdapters(deps: {
  search: SearchProvider;
  llm: LLMProvider;
  repo?: RepoWriter;
}): ResearchSteps {
  return {
    searchDocs: ({ platform }) => deps.search.findOfficialDocs(platform),
    reconstructRecord: ({ platform, docs }) => reconstructWithClassification(deps.llm, platform, docs),
    draftContribution: ({ record }) => draftWithClassification(deps.repo, record),
  };
}
