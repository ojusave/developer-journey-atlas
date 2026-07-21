import type { MetricRow, PlatformRecord } from "./ports.js";

// Guardrail copy kept consistent with MEASUREMENT-CONTRACT.md and the site.
// The public surface shows the documented route shape only. It does not show a
// score, a rank, or any cross-platform ordering.
export const MEASUREMENT_NOTE =
  "This describes the route shape documented in official docs, not usability, conversion, or observed developer completion time. " +
  "It is not a ranking.";

/** One documented step, shown in order. Descriptive, never scored. */
export interface StepView {
  stepNumber: number;
  phase: string | null;
  actor: string | null;
  interface: string | null;
  action: string;
  details: string[];
  successSignal: string | null;
  required: boolean;
  sourceIds: string[];
}

export interface Assessment {
  name: string;
  slug: string;
  organization: string | null;
  category: string;
  outcome: string;
  selectedSurface: string;
  researchedAt: string | null;
  recordAvailable: boolean;
  firstSuccess: {
    milestone: string | null;
    normalizedOutcome: string | null;
    completionSignal: string | null;
    boundaryType: string | null;
  };
  prerequisites: Array<{ type: string; requirement: string; required: boolean }>;
  /** Friction gates are descriptive notes only. They are not scored or counted into any ranking. */
  frictionGates: Array<{ atStep: number | null; type: string; description: string }>;
  steps: StepView[];
  timeToFirstSuccess: { vendorClaim: boolean; value: string } | null;
  pathStepCount: number;
  sources: Array<{ id: string | null; title: string; url: string }>;
  sourceCount: number;
  uncertaintyCount: number;
  recordUrl: string;
  note: string;
}

/**
 * Join a metrics row with its canonical record into a single assessment.
 * The record is optional: when absent, record-only fields degrade to empty
 * rather than throwing. No effort score, count-based metric, or cross-platform
 * ordering is exposed here: the public surface shows documented steps only.
 */
export function buildAssessment(row: MetricRow, record?: PlatformRecord): Assessment {
  const fs = record?.documented_first_success;
  const ttfs = record?.time_to_first_success;

  const steps: StepView[] = (record?.primary_path ?? []).map((s) => ({
    stepNumber: s.step_number,
    phase: s.phase ?? null,
    actor: s.actor ?? null,
    interface: s.interface ?? null,
    action: s.action,
    details: s.details ?? [],
    successSignal: s.success_signal ?? null,
    required: s.required !== false,
    sourceIds: s.source_ids ?? [],
  }));

  return {
    name: row.name,
    slug: row.slug,
    organization: record?.platform?.organization ?? null,
    category: row.category,
    outcome: row.outcome,
    selectedSurface: row.selected_surface,
    researchedAt: record?.researched_at ?? null,
    recordAvailable: Boolean(record),
    firstSuccess: {
      milestone: fs?.official_milestone ?? null,
      normalizedOutcome: fs?.normalized_outcome ?? null,
      completionSignal: fs?.observable_completion_signal ?? null,
      boundaryType: fs?.boundary_evidence?.type ?? null,
    },
    prerequisites: (record?.prerequisites ?? []).map((p) => ({
      type: p.type,
      requirement: p.requirement,
      required: p.required,
    })),
    frictionGates: (record?.friction_gates ?? []).map((g) => ({
      atStep: g.at_step ?? null,
      type: g.type ?? "gate",
      description: g.description ?? g.requirement ?? "",
    })),
    steps,
    timeToFirstSuccess:
      ttfs && ttfs.value
        ? { vendorClaim: Boolean(ttfs.vendor_claim), value: ttfs.value }
        : null,
    pathStepCount: record?.primary_path?.length ?? steps.length,
    sources: (record?.sources ?? []).map((s) => ({ id: s.id ?? null, title: s.title, url: s.url })),
    sourceCount: record?.sources?.length ?? 0,
    uncertaintyCount: record?.uncertainties?.length ?? 0,
    recordUrl: `data/records/${row.slug}.json`,
    note: MEASUREMENT_NOTE,
  };
}
