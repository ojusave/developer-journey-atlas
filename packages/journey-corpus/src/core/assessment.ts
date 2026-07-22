import type { MetricRow, PlatformRecord, ShortestPathAudit } from "./ports.js";
import type { DocumentedOnboardingLoad } from "./onboardingLoad.js";

// Guardrail copy kept consistent with MEASUREMENT-CONTRACT.txt and the site.
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
  requiredFields: Array<{ label: string; type: string; evidenceState: string; notes: string | null }>;
  evidenceState: string | null;
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
  auditStatus: "verified" | "blocked" | "needs-human-judgment" | "pending";
  auditUrl: string | null;
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
  pathStepCount: number | null;
  sources: Array<{ id: string | null; title: string; url: string }>;
  sourceCount: number;
  uncertaintyCount: number;
  routeSignals: null | {
    requiredActions: number;
    requiredFields: number;
    waits: number;
    gates: number;
  };
  investigationPrompts: string[];
  onboardingLoad: DocumentedOnboardingLoad | null;
  recordUrl: string;
  note: string;
}

/**
 * Join a metrics row with its canonical record into a single assessment.
 * The record is optional: when absent, record-only fields degrade to empty
 * rather than throwing. No effort score, count-based metric, or cross-platform
 * ordering is exposed here: the public surface shows documented steps only.
 */
export function buildAssessment(
  row: MetricRow,
  record?: PlatformRecord,
  onboardingLoad: DocumentedOnboardingLoad | null = null,
  audit?: ShortestPathAudit,
): Assessment {
  const fs = record?.documented_first_success;
  const ttfs = record?.time_to_first_success;
  const verified = audit?.audit_status === "verified";

  // Prefer an audited required_path when present. Live research drafts often have
  // no audit yet: fall back to the machine-drafted primary_path so the UI shows
  // the onboarding steps instead of an empty route.
  const auditSteps: StepView[] = (audit?.required_path ?? []).map((s) => ({
    stepNumber: s.step_number,
    phase: s.kind ?? null,
    actor: "developer",
    interface: s.interface ?? null,
    action: s.action,
    details: [],
    successSignal: s.observable_result ?? null,
    required: true,
    sourceIds: s.source_ids ?? [],
    requiredFields: (s.required_fields ?? []).map((field) => ({
      label: field.label,
      type: field.field_type,
      evidenceState: field.evidence_state,
      notes: field.notes ?? null,
    })),
    evidenceState: s.evidence_state ?? null,
  }));
  const recordSteps: StepView[] = (record?.primary_path ?? []).map((s, index) => ({
    stepNumber: s.step_number ?? index + 1,
    phase: s.phase ?? null,
    actor: s.actor ?? "developer",
    interface: s.interface ?? null,
    action: s.action,
    details: Array.isArray(s.details) ? s.details.map(String) : [],
    successSignal: s.success_signal ?? null,
    required: s.required !== false,
    sourceIds: s.source_ids ?? [],
    requiredFields: [],
    evidenceState: null,
  }));
  const steps = auditSteps.length > 0 ? auditSteps : recordSteps;

  return {
    name: row.name,
    slug: row.slug,
    organization: record?.platform?.organization ?? null,
    category: row.category,
    outcome: row.outcome,
    selectedSurface: audit?.route_selection.selected ?? audit?.route_selection.surface ?? row.selected_surface,
    researchedAt: audit?.audited_at ?? record?.researched_at ?? null,
    recordAvailable: Boolean(record),
    auditStatus: audit?.audit_status ?? "pending",
    auditUrl: audit ? `/data/audits/${row.slug}.json` : null,
    firstSuccess: {
      milestone: audit?.first_success.outcome ?? fs?.official_milestone ?? null,
      normalizedOutcome: audit?.first_success.outcome ?? fs?.normalized_outcome ?? null,
      completionSignal: audit?.first_success.observable_signal ?? fs?.observable_completion_signal ?? null,
      boundaryType: fs?.boundary_evidence?.type ?? null,
    },
    prerequisites: (() => {
      const fromRecord = (record?.prerequisites ?? []).map((p) => ({
        type: p.type,
        requirement: p.requirement,
        required: Boolean(p.required),
      }));
      if (fromRecord.length) return fromRecord;
      return (audit?.prerequisites ?? []).map((p) => ({
        type: "other",
        requirement: p.description,
        required: true,
      }));
    })(),
    frictionGates: (() => {
      const fromRecord = (record?.friction_gates ?? []).map((g) => ({
        atStep: g.at_step ?? null,
        type: g.type ?? "gate",
        description: g.description ?? g.requirement ?? "",
      }));
      if (!audit) return fromRecord;
      const fromAudit = [
        ...audit.external_gates.map((gate) => ({ atStep: null, type: "external gate", description: gate.description })),
        ...audit.unavoidable_waits.map((wait) => ({ atStep: null, type: "wait", description: wait.description })),
      ];
      return fromAudit.length > 0 ? fromAudit : fromRecord;
    })(),
    steps,
    timeToFirstSuccess:
      ttfs && ttfs.value
        ? { vendorClaim: Boolean(ttfs.vendor_claim), value: ttfs.value }
        : null,
    pathStepCount: verified ? audit.required_path.length : null,
    sources: (audit?.sources ?? record?.sources ?? []).map((s) => ({ id: s.id ?? null, title: s.title, url: s.url })),
    sourceCount: (audit?.sources ?? record?.sources ?? []).length,
    uncertaintyCount: audit?.uncertainties.length ?? record?.uncertainties?.length ?? 0,
    routeSignals: verified && audit.counts
      ? {
          requiredActions: audit.counts.required_actions,
          requiredFields: audit.counts.required_fields,
          waits: audit.counts.unavoidable_waits,
          gates: audit.counts.external_gates,
        }
      : null,
    investigationPrompts: audit
      ? [
          ...audit.uncertainties.map((uncertainty) => `${uncertainty.question} Evidence needed: ${uncertainty.evidence_needed}`),
          ...audit.external_gates.map((gate) => `Check this required external gate: ${gate.description}`),
          ...audit.prerequisites.map((prerequisite) => `Confirm this required starting condition: ${prerequisite.description}`),
        ].slice(0, 3)
      : ["This platform is pending a shortest-required-path re-audit. Legacy source evidence remains available, but its action counts are withheld."],
    onboardingLoad: verified ? onboardingLoad : null,
    recordUrl: `/data/records/${row.slug}.json`,
    note: verified
      ? `${MEASUREMENT_NOTE} This path starts at account creation, excludes optional work, and lists required fields under each action.`
      : "This source record has not passed the shortest-required-path audit. Counts and peer comparison are withheld until it does.",
  };
}
