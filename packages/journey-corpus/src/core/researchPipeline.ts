import type {
  DataStore, LLMProvider, MetricRow, PlatformRecord, RepoWriter, SearchProvider,
} from "./ports.js";
import { buildAssessment, type Assessment } from "./assessment.js";
import { buildDocumentedOnboardingLoad } from "./onboardingLoad.js";

export interface ResearchDeps {
  search: SearchProvider;
  llm: LLMProvider;
  repo?: RepoWriter;
  store: DataStore;
  /** Bridge to the shared measurement contract (selectedPathRow). */
  buildRow: (record: PlatformRecord) => MetricRow;
}

export type ResearchEvent =
  | { type: "status"; step: string; message: string }
  | { type: "known"; slug: string }
  | { type: "result"; assessment: Assessment; record: PlatformRecord; draft: true }
  | { type: "pr"; url: string }
  | { type: "pr_skipped"; reason: string }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

/** Sink for pipeline events. The API layer maps these to SSE frames. */
export type Emit = (event: ResearchEvent) => void;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function msg(err: unknown): string {
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

function validateSourceGrounding(record: PlatformRecord, docs: Array<{ url: string }>): string | null {
  const searchedUrls = new Set(docs.map((doc) => normalizedUrl(doc.url)));
  const unsupported = (record.sources ?? []).filter((source) => !searchedUrls.has(normalizedUrl(source.url)));
  if (unsupported.length > 0) {
    return `The draft cited ${unsupported.length} source URL${unsupported.length === 1 ? "" : "s"} that were not returned by the official-docs search.`;
  }
  return null;
}

/**
 * Orchestrate live research for an unknown platform: search official docs,
 * reconstruct a schema-valid source-evidence record, show it without audited
 * counts or comparison, then optionally open a draft PR. A separate shortest-
 * path audit is required before publication. Every external step is isolated: a failure emits a typed
 * error/skip event and never throws out of the function. Push-based so the SSE
 * layer can flush each event as it happens.
 */
export async function runResearch(platform: string, deps: ResearchDeps, emit: Emit): Promise<void> {
  const slug = slugify(platform);
  if (slug && deps.store.getRow(slug)) {
    emit({ type: "known", slug });
    return;
  }

  let docs;
  try {
    emit({ type: "status", step: "search", message: `Searching official documentation for ${platform}…` });
    docs = await deps.search.findOfficialDocs(platform);
  } catch (err) {
    emit({ type: "error", code: "search_failed", message: msg(err) });
    return;
  }
  if (docs.length === 0) {
    emit({ type: "error", code: "no_docs", message: "No official documentation found for that platform." });
    return;
  }

  let record: PlatformRecord;
  try {
    emit({ type: "status", step: "reconstruct", message: "Reconstructing a source-evidence draft from account creation to first success…" });
    record = await deps.llm.reconstructRecord(platform, docs);
  } catch (err) {
    emit({ type: "error", code: "llm_failed", message: msg(err) });
    return;
  }

  const groundingError = validateSourceGrounding(record, docs);
  if (groundingError) {
    emit({ type: "error", code: "source_grounding_failed", message: groundingError });
    return;
  }

  let assessment: Assessment;
  try {
    emit({ type: "status", step: "assemble", message: "Assembling the unaudited source draft with counts withheld…" });
    const row = deps.buildRow(record);
    assessment = buildAssessment(row, record, buildDocumentedOnboardingLoad(row, deps.store));
  } catch (err) {
    emit({ type: "error", code: "assemble_failed", message: msg(err) });
    return;
  }

  emit({ type: "result", assessment, record, draft: true });

  if (!deps.repo) {
    emit({
      type: "pr_skipped",
      reason: "Auto-PR is off (no GITHUB_TOKEN set). The drafted record is shown below for manual submission.",
    });
    emit({ type: "done" });
    return;
  }
  if (record.research_status !== "complete") {
    emit({
      type: "pr_skipped",
      reason: `Record marked "${record.research_status}", so no automatic PR was opened. Resolve its evidence gaps before creating a shortest-path audit.`,
    });
    emit({ type: "done" });
    return;
  }

  try {
    emit({ type: "status", step: "pr", message: "Opening a draft pull request in Developer Journey Atlas…" });
    const { url } = await deps.repo.openDraftRecordPR(record);
    emit({ type: "pr", url });
  } catch (err) {
    emit({ type: "pr_skipped", reason: `Could not open a PR automatically: ${msg(err)}` });
  }
  emit({ type: "done" });
}
