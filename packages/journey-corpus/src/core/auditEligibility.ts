import type { ShortestPathAudit } from "./ports.js";

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Deterministic gates for promoting an audit to verified.
 * A guess labeled verified is never eligible.
 */
export function evaluateAuditEligibility(audit: ShortestPathAudit): EligibilityResult {
  const reasons: string[] = [];

  if (!audit.route_selection?.selected) {
    reasons.push("No selected route: peer routes remain unresolved.");
  }
  if (!audit.required_path?.length) {
    reasons.push("required_path is empty.");
  }
  if ((audit.uncertainties?.length ?? 0) > 0) {
    reasons.push(`${audit.uncertainties.length} unresolved uncertainties remain.`);
  }

  const unverifiedAction = audit.required_path?.find((action) => action.evidence_state === "unverified");
  if (unverifiedAction) {
    reasons.push(`Unverified action evidence at step ${unverifiedAction.step_number}.`);
  }
  const unverifiedField = audit.required_path
    ?.flatMap((action) => action.required_fields.map((field) => ({ field, step: action.step_number })))
    .find((row) => row.field.evidence_state === "unverified");
  if (unverifiedField) {
    reasons.push(`Unverified field evidence at step ${unverifiedField.step}.`);
  }

  const outcome = audit.first_success?.outcome ?? "";
  if (/unresolved/i.test(outcome)) {
    reasons.push("first_success.outcome is still unresolved.");
  }

  for (const [index, action] of (audit.required_path ?? []).entries()) {
    if (action.step_number !== index + 1) {
      reasons.push("required_path step numbers must be contiguous from 1.");
      break;
    }
  }

  if (audit.counts) {
    const fieldTotal = audit.required_path.reduce((n, action) => n + action.required_fields.length, 0);
    if (audit.counts.required_actions !== audit.required_path.length) {
      reasons.push("counts.required_actions does not match required_path length.");
    }
    if (audit.counts.required_fields !== fieldTotal) {
      reasons.push("counts.required_fields does not match field list.");
    }
    if (audit.counts.external_gates !== audit.external_gates.length) {
      reasons.push("counts.external_gates does not match external_gates length.");
    }
    if (audit.counts.unavoidable_waits !== audit.unavoidable_waits.length) {
      reasons.push("counts.unavoidable_waits does not match unavoidable_waits length.");
    }
  } else if (reasons.length === 0) {
    reasons.push("counts are required for verified audits.");
  }

  return { eligible: reasons.length === 0, reasons };
}

/** Derive counts from path lists. */
export function deriveAuditCounts(audit: ShortestPathAudit): NonNullable<ShortestPathAudit["counts"]> {
  return {
    required_actions: audit.required_path.length,
    required_fields: audit.required_path.reduce((n, action) => n + action.required_fields.length, 0),
    external_gates: audit.external_gates.length,
    unavoidable_waits: audit.unavoidable_waits.length,
  };
}

/**
 * Apply eligibility: verified + counts, or NHJ/blocked with counts null.
 * Preserves blocked if already blocked and still ineligible.
 */
export function applyEligibilityStatus(audit: ShortestPathAudit): ShortestPathAudit {
  const { eligible, reasons } = evaluateAuditEligibility(audit);
  if (eligible) {
    return {
      ...audit,
      audit_status: "verified",
      counts: deriveAuditCounts(audit),
      uncertainties: [],
    };
  }

  const status = audit.audit_status === "blocked" ? "blocked" : "needs-human-judgment";
  const mergedUncertainties = [
    ...audit.uncertainties,
    ...reasons
      .filter((reason) => !audit.uncertainties.some((u) => u.question === reason))
      .map((reason) => ({
        question: reason,
        impact: "Action counts and peer comparison must stay withheld until resolved.",
        evidence_needed: "Official docs or public UI evidence that resolves this gate.",
      })),
  ];

  return {
    ...audit,
    audit_status: status,
    counts: null,
    uncertainties: mergedUncertainties,
  };
}
