import type {
  DataStore, LLMProvider, MetricRow, PlatformRecord, RepoWriter, SearchProvider,
} from "./ports.js";
import { buildAssessment, type Assessment } from "./assessment.js";
import { buildComparison, type Comparison } from "./comparison.js";

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
  | { type: "result"; assessment: Assessment; comparison: Comparison; record: PlatformRecord; draft: true }
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

/**
 * Orchestrate live research for an unknown platform: search official docs,
 * reconstruct a schema-valid record, measure and compare it, then (optionally)
 * open a draft PR. Every external step is isolated: a failure emits a typed
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
    emit({ type: "status", step: "reconstruct", message: "Reconstructing the documented first-mile route from official docs…" });
    record = await deps.llm.reconstructRecord(platform, docs);
  } catch (err) {
    emit({ type: "error", code: "llm_failed", message: msg(err) });
    return;
  }

  let assessment: Assessment;
  let comparison: Comparison;
  try {
    emit({ type: "status", step: "measure", message: "Measuring the route and placing it in its category…" });
    const row = deps.buildRow(record);
    assessment = buildAssessment(row, record);
    comparison = buildComparison(row, deps.store.listRows());
  } catch (err) {
    emit({ type: "error", code: "measure_failed", message: msg(err) });
    return;
  }

  emit({ type: "result", assessment, comparison, record, draft: true });

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
      reason: `Record marked "${record.research_status}", so no automatic PR was opened. Review it before submitting.`,
    });
    emit({ type: "done" });
    return;
  }

  try {
    emit({ type: "status", step: "pr", message: "Opening a draft pull request to the dataset…" });
    const { url } = await deps.repo.openDraftRecordPR(record);
    emit({ type: "pr", url });
  } catch (err) {
    emit({ type: "pr_skipped", reason: `Could not open a PR automatically: ${msg(err)}` });
  }
  emit({ type: "done" });
}
