// Shared contracts and port interfaces. Application code depends only on these,
// never on a concrete adapter or vendor SDK.

/** One row of selected-path-heuristic.json: the precomputed normalized metrics. */
export interface MetricRow {
  name: string;
  slug: string;
  category: string;
  research_status: string;
  selected_surface: string;
  route_selection_method: string;
  boundary_evidence_type: string;
  first_success_type: string;
  outcome: string;
  raw_transition_count: number;
  developer_action_count: number;
  required_developer_action_count: number;
  optional_developer_action_count: number;
  platform_event_count: number;
  documentation_navigation_count: number;
  wait_or_async_count: number;
  gate_count: number;
  heuristic_effort_score: number;
  comparability_status: string;
}

/** Quality and comparability fields loaded from ds-quality.json. */
export interface QualityRow {
  slug: string;
  decision_count: number;
  re_researched: boolean;
  comparability_status: string;
}

/** Dataset-level metadata surfaced to the UI. */
export interface DatasetMeta {
  count: number;
  generatedAt: string | null;
  scoreModelVersion: string | null;
  caveats: string[];
  totals: { platforms: number; steps: number; sources: number };
}

/** A canonical record from records/<slug>.json (only the fields we render). */
export interface PlatformRecord {
  platform: { name: string; slug: string; organization: string };
  category: string;
  researched_at?: string;
  surface?: { name?: string; selection_basis?: string };
  documented_first_success?: {
    official_milestone?: string;
    normalized_outcome?: string;
    observable_completion_signal?: string;
    boundary_evidence?: { type?: string };
  };
  prerequisites?: Array<{ order?: number; type: string; requirement: string; required: boolean }>;
  primary_path?: Array<{
    step_number: number;
    phase?: string;
    actor?: string;
    interface?: string;
    action: string;
    details?: string[];
    success_signal?: string;
    required?: boolean;
    source_ids?: string[];
  }>;
  friction_gates?: Array<{ at_step?: number; type?: string; description?: string; requirement?: string }>;
  time_to_first_success?: {
    vendor_claim?: boolean;
    value?: string;
  };
  sources?: Array<{ id: string; title: string; url: string }>;
  uncertainties?: Array<{ question: string }>;
  [key: string]: unknown;
}

/**
 * DataStore is the only capability the feature code needs to read the dataset.
 * Critical-path dependency: the app is meaningless without it.
 */
export interface DataStore {
  meta(): DatasetMeta;
  listRows(): MetricRow[];
  getRow(slug: string): MetricRow | undefined;
  /** Canonical record. May be absent even when a row exists (degrade gracefully). */
  getRecord(slug: string): PlatformRecord | undefined;
  getQuality(slug: string): QualityRow | undefined;
}

/** A single documented onboarding signal for a platform (Phase 2 research output). */
export interface ResearchResult {
  slug: string;
  status: "found" | "not-found" | "error";
  row?: MetricRow;
  record?: PlatformRecord;
  message?: string;
}

/** One official-docs hit, optionally with crawled page content for grounding. */
export interface DocHit {
  title: string;
  url: string;
  content?: string;
}

/** Phase 2 ports. Non-critical: failures degrade, never crash the site. */
export interface SearchProvider {
  findOfficialDocs(platform: string): Promise<DocHit[]>;
}

export interface LLMProvider {
  reconstructRecord(platform: string, docs: Array<{ title: string; url: string }>): Promise<PlatformRecord>;
}

export interface RepoWriter {
  openDraftRecordPR(record: PlatformRecord): Promise<{ url: string }>;
}
