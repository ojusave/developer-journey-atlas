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
  audits?: { verified: number; pending: number; blocked: number; needsHumanJudgment: number };
}

export interface AuditField {
  label: string;
  field_type: string;
  evidence_state: "documented" | "observed-public-ui" | "unverified";
  source_ids: string[];
  notes?: string;
}

export interface ShortestPathAudit {
  schema_version: "1.0";
  platform: { name: string; slug: string; category: string };
  audit_status: "verified" | "blocked" | "needs-human-judgment";
  audited_at: string;
  source_record_sha256: string;
  starting_state: { boundary: "account creation"; assumptions: string[] };
  developer_goal: string;
  first_success: { outcome: string; observable_signal: string; source_ids: string[] };
  route_selection: {
    surface: string;
    rule: string;
    selected: string | null;
    candidates: Array<{ name: string; status: string; reason: string }>;
  };
  required_path: Array<{
    step_number: number;
    kind: string;
    interface: string;
    action: string;
    required_fields: AuditField[];
    observable_result: string;
    evidence_state: "documented" | "observed-public-ui" | "unverified";
    source_ids: string[];
  }>;
  prerequisites: Array<{ description: string; source_ids: string[] }>;
  external_gates: Array<{ description: string; source_ids: string[] }>;
  unavoidable_waits: Array<{ description: string; source_ids: string[] }>;
  platform_outcomes: Array<{ description: string; source_ids: string[] }>;
  excluded: Array<{ item: string; reason: string; source_ids: string[] }>;
  sources: Array<{ id: string; title: string; url: string; source_type: string; accessed_at: string }>;
  uncertainties: Array<{ question: string; impact: string; evidence_needed: string }>;
  counts: null | { required_actions: number; required_fields: number; external_gates: number; unavoidable_waits: number };
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

/** Optional journey overlay with friction highlights (see journeyOverlay.ts). */
export interface JourneyCapable {
  getJourney(slug: string): import("./journeyOverlay.js").JourneyOverlay | undefined;
  blockerReasonCount(): number;
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
  /** Verified or in-progress shortest-path audit. May be absent while re-audit is pending. */
  getAudit(slug: string): ShortestPathAudit | undefined;
  getQuality(slug: string): QualityRow | undefined;
  /** Joined journey + friction overlays when the store supports it. */
  getJourney?(slug: string): import("./journeyOverlay.js").JourneyOverlay | undefined;
  /** Count of catalog reason nodes (790 when fully seeded). */
  blockerReasonCount?(): number;
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
  /** Opens (or reuses) a draft PR for the record. `reused` is true when an
   * already-open PR for the same platform was returned instead of a new one. */
  openDraftRecordPR(record: PlatformRecord): Promise<{ url: string; reused: boolean }>;
}
