import type {
  DataStore, DocHit, LLMProvider, MetricRow, PlatformRecord, RepoWriter, SearchProvider,
} from "./ports.js";
import { buildAssessment } from "./assessment.js";
import { buildDocumentedOnboardingLoad } from "./onboardingLoad.js";
import type { ContributionResult, ResearchOutcome, ResearchSteps, ResearchTaskInput } from "../workflows/contract.js";
import { draftWithClassification, reconstructWithClassification } from "../workflows/classify.js";
import {
  resolvePlatformIdentity,
  sourceCanSupportClaims,
  validateSourceAuthority,
  type PlatformIdentity,
} from "./sourceAuthority.js";
import { draftBlockingJourneyFindings, validateJourneyGraph } from "./journeyGraph.js";

/** Read-only context the orchestration needs beyond the injectable steps. */
export interface ResearchContext {
  store: DataStore;
  identities: PlatformIdentity[];
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

function normalizedEvidenceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A locator is covered only when its specific comma-separated parts occur in
 * the exact bounded content supplied to reconstruction. This prevents a page
 * shell, an empty page, or a section beyond the retrieval limit from grounding
 * a claim merely because the URL was discovered.
 */
export function evidenceLocatorIsCovered(locator: string, doc: { title: string; content?: string }): boolean {
  const haystack = normalizedEvidenceText(`${doc.title} ${doc.content ?? ""}`);
  if (!haystack || !doc.content?.trim()) return false;
  const whole = normalizedEvidenceText(locator);
  if (whole.length >= 5 && haystack.includes(whole)) return true;
  const parts = locator
    .split(/[,;:]/)
    .map(normalizedEvidenceText)
    .filter((part) => part.length >= 3);
  return parts.length > 0 && parts.every((part) => haystack.includes(part));
}

/** Every cited source URL must have been returned by the official-docs search. */
export function validateSourceGrounding(
  record: PlatformRecord,
  docs: Array<{ title: string; url: string; content?: string }>,
  options: { requireLiteralLocators?: boolean } = {},
): string | null {
  const searchedUrls = new Set(docs.map((doc) => normalizedUrl(doc.url)));
  const unsupported = (record.sources ?? []).filter((source) => !searchedUrls.has(normalizedUrl(source.url)));
  if (unsupported.length > 0) {
    return `The draft cited ${unsupported.length} source URL${unsupported.length === 1 ? "" : "s"} that were not returned by the official-docs search.`;
  }
  const sourceIds = (record.sources ?? []).map((source) => source.id).filter(Boolean);
  if (sourceIds.length === 0 || new Set(sourceIds).size !== sourceIds.length) {
    return "The draft needs unique source IDs for its accepted evidence pages.";
  }
  const acceptedSourceIds = new Set(sourceIds);
  const recordSourceById = new Map((record.sources ?? []).map((source) => [source.id, source]));
  const docByUrl = new Map(docs.map((doc) => [normalizedUrl(doc.url), doc]));
  const graph = record.journey_graph;
  if (graph) {
    const evidence = [
      ...graph.prerequisites.flatMap((item) => item.evidence),
      ...graph.nodes.flatMap((node) => node.evidence),
      ...graph.nodes.flatMap((node) => node.requiredFields.flatMap((field) => field.evidence)),
      ...graph.edges.flatMap((edge) => edge.evidence),
      ...graph.externalGates.flatMap((item) => item.evidence),
      ...graph.candidateRoutes.flatMap((item) => item.evidence),
      ...graph.firstSuccessBoundary.evidence,
    ];
    const invalid = evidence.filter(
      (item) => !acceptedSourceIds.has(item.sourceId) || !item.locator?.trim(),
    );
    if (invalid.length > 0) {
      return `${invalid.length} graph evidence reference${invalid.length === 1 ? "" : "s"} did not resolve to an accepted source ID and locator.`;
    }
    if (options.requireLiteralLocators === false) return null;
    const uncovered = evidence.filter((item) => {
      const source = recordSourceById.get(item.sourceId);
      const doc = source ? docByUrl.get(normalizedUrl(source.url)) : undefined;
      return !doc || !evidenceLocatorIsCovered(item.locator, doc);
    });
    if (uncovered.length > 0) {
      return `${uncovered.length} graph evidence locator${uncovered.length === 1 ? "" : "s"} did not occur in the retrieved content supplied to reconstruction.`;
    }
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

  if (slug && ctx.store.getRow(slug) && ctx.store.isPublicEligible(slug)) {
    return { outcome: "known", slug };
  }

  const identityResult = resolvePlatformIdentity(platform, ctx.identities);
  if (identityResult.outcome === "identity_ambiguous") {
    return {
      outcome: "identity_ambiguous",
      candidates: identityResult.candidates.map((candidate) => ({
        slug: candidate.slug,
        name: candidate.canonicalName,
        organization: candidate.organization,
      })),
    };
  }
  if (identityResult.outcome === "identity_unresolved") {
    return { outcome: "identity_unresolved" };
  }
  const identity = identityResult.identity;

  let docs: DocHit[];
  try {
    docs = await steps.searchDocs({ platform, identity });
  } catch {
    return { outcome: "search_failed", message: "Official-source discovery failed." };
  }
  if (docs.length === 0) {
    return { outcome: "no_official_source" };
  }
  const unusable = docs.filter((doc) => {
    const authority = validateSourceAuthority(doc.url, identity);
    return !sourceCanSupportClaims(authority, doc.metadata);
  });
  if (unusable.length > 0) {
    return {
      outcome: "official_source_unusable",
      message: `${unusable.length} official source page${unusable.length === 1 ? "" : "s"} lacked usable retrieved content.`,
    };
  }

  let reconstruct;
  try {
    reconstruct = await steps.reconstructRecord({ platform, docs });
  } catch {
    return { outcome: "model_failed", message: "Route reconstruction failed." };
  }
  if (reconstruct.status === "invalid_output") {
    return { outcome: "invalid_output", message: reconstruct.message };
  }
  const record = reconstruct.record;

  // A live result is a private draft, not a published corpus record. Official
  // source URLs, source IDs, nonempty locators, and graph integrity are still
  // mandatory here. Exact locator-to-page matching remains a publication gate
  // so a useful draft is not hidden from the developer awaiting review.
  const groundingError = validateSourceGrounding(
    record,
    docs,
    { requireLiteralLocators: false },
  );
  if (groundingError) {
    return { outcome: "claim_grounding_failed", message: groundingError };
  }
  if (!record.journey_graph) {
    return {
      outcome: "claim_grounding_failed",
      message: "The reconstruction did not include an evidence-backed journey graph.",
    };
  }
  const graphFindings = draftBlockingJourneyFindings(
    validateJourneyGraph(record.journey_graph, record.platform.slug),
  );
  if (graphFindings.length > 0) {
    return {
      outcome: "claim_grounding_failed",
      message: `Journey integrity failed: ${graphFindings.map((finding) => finding.code).join(", ")}.`,
    };
  }

  const row = ctx.buildRow(record);
  const assessment = buildAssessment(row, record, buildDocumentedOnboardingLoad(row, ctx.store));

  // Live research shows the draft in the UI. GitHub draft PRs are not part of the
  // runtime path: Postgres (or the in-session result) is enough for the product.
  const contribution: ContributionResult = {
    status: "skipped",
    reason: "Draft shown in the Atlas; no GitHub contribution step.",
  };

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
    searchDocs: ({ platform, identity }) => deps.search.findOfficialDocs(platform, identity),
    reconstructRecord: ({ platform, docs }) => reconstructWithClassification(deps.llm, platform, docs),
    draftContribution: ({ record }) => draftWithClassification(deps.repo, record),
  };
}
