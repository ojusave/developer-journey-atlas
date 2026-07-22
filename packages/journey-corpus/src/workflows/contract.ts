// Contracts shared between the Workflow tasks (which produce results) and the web
// service (which starts runs and projects their status to the browser). Both live
// in this package, so there is one source of truth for the run shape.

import type { Assessment } from "../core/assessment.js";
import type { DocHit, PlatformRecord } from "../core/ports.js";

/**
 * The only thing a run needs: the user's request and its normalized identity.
 * Small, JSON-serializable, and free of secrets, datasets, or browser state.
 * `slug` doubles as the idempotency key: the same platform always maps to the
 * same slug, and the GitHub contribution derives a deterministic branch from it.
 */
export interface ResearchTaskInput {
  /** Trimmed user request. Used for the docs search query and display. */
  platform: string;
  /** Normalized slug: durable identity and idempotency key. */
  slug: string;
}

/** Outcome of the GitHub draft-contribution step. Never auto-merges. */
export type ContributionResult =
  | { status: "opened"; url: string; reused: boolean }
  | { status: "skipped"; reason: string };

/** Result of reconstructing a record from docs. Distinguishes the deterministic
 * "model could not produce a schema-valid record" terminal from transient
 * failures (which throw and are retried at the task boundary). */
export type ReconstructResult =
  | { status: "ok"; record: PlatformRecord }
  | { status: "invalid_output"; message: string };

/**
 * Terminal, bounded result of a research run. Contains only what the UI needs to
 * render the machine-drafted assessment and contribution: no raw source-page
 * bodies, no secrets, no hidden reasoning.
 */
export type ResearchOutcome =
  | { outcome: "known"; slug: string }
  | { outcome: "no_docs" }
  | { outcome: "invalid_output"; message: string }
  | { outcome: "source_grounding_failed"; message: string }
  | { outcome: "search_failed"; message: string }
  | { outcome: "model_failed"; message: string }
  | {
      outcome: "completed";
      slug: string;
      record: PlatformRecord;
      assessment: Assessment;
      contribution: ContributionResult;
    };

/**
 * Injectable research steps. In production each step is a chained Workflow
 * subtask with its own retry and timeout; in tests they are fakes. This is the
 * seam that lets the same orchestration run durably on Render and inline in unit
 * tests without touching the network.
 */
export interface ResearchSteps {
  searchDocs(input: { platform: string }): Promise<DocHit[]>;
  reconstructRecord(input: { platform: string; docs: DocHit[] }): Promise<ReconstructResult>;
  draftContribution(input: { record: PlatformRecord }): Promise<ContributionResult>;
}

/** Phase the browser renders. Derived server-side from the Workflow run status. */
export type RunPhase = "queued" | "running" | "retrying" | "completed" | "failed";

/**
 * Safe projection of a Workflow run for the browser. Never contains Render or
 * provider credentials, raw upstream errors, or the run's raw task input.
 */
export interface RunStatusProjection {
  runId: string;
  phase: RunPhase;
  /** Present once the run reaches a terminal, successful state. */
  result: ResearchOutcome | import("../core/runVerifyAudit.js").VerifyOutcome | null;
  /** User-safe message when the run itself failed (infrastructure/provider). */
  message: string | null;
}

/**
 * Port the web service depends on to start research runs and read their status,
 * without importing the Render SDK directly. The concrete adapter holds the
 * server-side Render API key; the browser never sees it.
 */
export interface WorkflowRunner {
  start(input: ResearchTaskInput): Promise<{ runId: string }>;
  /** Start an arbitrary registered task by slug (e.g. verifyPlatformAudit). */
  startNamedTask(taskSlug: string, input: unknown): Promise<{ runId: string }>;
  status(runId: string): Promise<RunStatusProjection>;
}
