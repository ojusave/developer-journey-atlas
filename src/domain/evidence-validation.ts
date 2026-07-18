import { getCatalogNode } from "./catalog";
import {
  deriveDiagnosticState,
  getActiveAnswerEvents,
  type CandidateReason,
  type DiagnosticCase,
  type DiagnosticState,
  type EvidenceKind,
} from "./diagnostic-engine";

export type DiagnosticClaimType = "observation" | "family_narrowed" | "reason_hypothesis" | "reason_supported" | "action";

export interface DiagnosticClaim {
  claimId: string;
  type: DiagnosticClaimType;
  statement: string;
  catalogId?: string;
  evidenceEventIds: string[];
  prerequisiteEvidence?: Record<string, string[]>;
  lookalikeEvidence?: Record<string, string[]>;
}

export interface DiagnosticPrerequisite {
  id: string;
  label: string;
  acceptedEvidenceKinds: EvidenceKind[];
}

export interface ReasonDiagnosticCard {
  reasonId: string;
  reviewState: "reviewed" | "locally_validated";
  observableImplication: string;
  prerequisites: DiagnosticPrerequisite[];
  nearestLookalikeReasonIds: string[];
  acceptedEvidenceKinds: EvidenceKind[];
}

export type ClaimValidationIssueCode =
  | "duplicate_claim_id"
  | "empty_statement"
  | "missing_evidence"
  | "inactive_evidence"
  | "missing_catalog_node"
  | "catalog_level_mismatch"
  | "candidate_not_live"
  | "reason_not_eligible"
  | "diagnostic_card_missing"
  | "diagnostic_card_unreviewed"
  | "insufficient_evidence_kind"
  | "prerequisite_not_tested"
  | "lookalike_not_tested";

export interface ClaimValidationIssue {
  claimId: string;
  code: ClaimValidationIssueCode;
  message: string;
}

export interface ClaimValidationResult {
  claimId: string;
  valid: boolean;
  issues: ClaimValidationIssue[];
}

export interface EvidenceValidationReport {
  valid: boolean;
  claims: ClaimValidationResult[];
  issues: ClaimValidationIssue[];
}

const strongEvidenceKinds = new Set<EvidenceKind>(["direct_observation", "product_data", "support_case", "developer_interview"]);

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function evidenceKindsForIds(caseFile: DiagnosticCase, eventIds: readonly string[]): EvidenceKind[] {
  const active = new Map(getActiveAnswerEvents(caseFile).map((event) => [event.eventId, event]));
  return unique(eventIds.flatMap((eventId) => active.get(eventId)?.evidenceKinds ?? [])) as EvidenceKind[];
}

function makeIssue(claimId: string, code: ClaimValidationIssueCode, message: string): ClaimValidationIssue {
  return { claimId, code, message };
}

function activeEvidenceIssues(caseFile: DiagnosticCase, claim: DiagnosticClaim): ClaimValidationIssue[] {
  const activeIds = new Set(getActiveAnswerEvents(caseFile).map((event) => event.eventId));
  const issues: ClaimValidationIssue[] = [];
  if (claim.evidenceEventIds.length === 0) {
    issues.push(makeIssue(claim.claimId, "missing_evidence", "The claim does not cite an accepted answer or observation."));
  }
  const inactiveIds = unique(claim.evidenceEventIds).filter((eventId) => !activeIds.has(eventId));
  if (inactiveIds.length > 0) {
    issues.push(makeIssue(claim.claimId, "inactive_evidence", `The claim cites corrected, missing, or inactive evidence: ${inactiveIds.join(", ")}.`));
  }
  return issues;
}

function validateReasonSupported(
  caseFile: DiagnosticCase,
  state: DiagnosticState,
  claim: DiagnosticClaim,
  cardsByReasonId: Map<string, ReasonDiagnosticCard>,
): ClaimValidationIssue[] {
  const issues: ClaimValidationIssue[] = [];
  const reason = claim.catalogId ? getCatalogNode(claim.catalogId) : null;
  if (!reason) return [makeIssue(claim.claimId, "missing_catalog_node", "A supported reason must cite a catalog reason ID.")];
  if (reason.kind !== "reason") return [makeIssue(claim.claimId, "catalog_level_mismatch", `${reason.id} is not an individual reason.`)];
  const candidate = state.candidateReasons.find((item) => item.reasonId === reason.id);
  if (!candidate || !["live", "needs_observation", "supported"].includes(candidate.evidenceState)) {
    issues.push(makeIssue(claim.claimId, "candidate_not_live", `${reason.id} is not live in the current stage and platform context.`));
  }
  if (reason.diagnosticEligibility !== "diagnosis_eligible" || !["reviewed", "locally_validated"].includes(reason.catalogMaturity)) {
    issues.push(makeIssue(claim.claimId, "reason_not_eligible", `${reason.id} is inventory research, not an eligible diagnosis.`));
  }
  const card = cardsByReasonId.get(reason.id);
  if (!card) {
    issues.push(makeIssue(claim.claimId, "diagnostic_card_missing", `${reason.id} has no reviewed diagnostic card.`));
    return issues;
  }
  if (!card.observableImplication.trim() || !["reviewed", "locally_validated"].includes(card.reviewState)) {
    issues.push(makeIssue(claim.claimId, "diagnostic_card_unreviewed", `${reason.id} does not have a complete reviewed observable implication.`));
  }
  const claimKinds = evidenceKindsForIds(caseFile, claim.evidenceEventIds);
  const acceptedKinds = new Set(card.acceptedEvidenceKinds);
  if (!claimKinds.some((kind) => strongEvidenceKinds.has(kind) && acceptedKinds.has(kind))) {
    issues.push(makeIssue(claim.claimId, "insufficient_evidence_kind", `${reason.id} is not supported by an accepted direct evidence source.`));
  }
  for (const prerequisite of card.prerequisites) {
    const eventIds = claim.prerequisiteEvidence?.[prerequisite.id] ?? [];
    const kinds = evidenceKindsForIds(caseFile, eventIds);
    if (!kinds.some((kind) => prerequisite.acceptedEvidenceKinds.includes(kind))) {
      issues.push(makeIssue(claim.claimId, "prerequisite_not_tested", `Prerequisite ${prerequisite.id} was not tested with accepted evidence.`));
    }
  }
  for (const lookalikeReasonId of card.nearestLookalikeReasonIds) {
    const eventIds = claim.lookalikeEvidence?.[lookalikeReasonId] ?? [];
    if (eventIds.length === 0 || eventIds.some((eventId) => !getActiveAnswerEvents(caseFile).some((event) => event.eventId === eventId))) {
      issues.push(makeIssue(claim.claimId, "lookalike_not_tested", `Nearest lookalike ${lookalikeReasonId} was not tested with active evidence.`));
    }
  }
  return issues;
}

export function validateDiagnosticClaims(input: {
  caseFile: DiagnosticCase;
  claims: DiagnosticClaim[];
  cards?: ReasonDiagnosticCard[];
  state?: DiagnosticState;
}): EvidenceValidationReport {
  const state = input.state ?? deriveDiagnosticState(input.caseFile);
  const cardsByReasonId = new Map((input.cards ?? []).map((card) => [card.reasonId, card]));
  const claimIdCounts = input.claims.reduce((counts, claim) => counts.set(claim.claimId, (counts.get(claim.claimId) ?? 0) + 1), new Map<string, number>());
  const results = input.claims.map((claim): ClaimValidationResult => {
    const issues = activeEvidenceIssues(input.caseFile, claim);
    if ((claimIdCounts.get(claim.claimId) ?? 0) > 1) issues.push(makeIssue(claim.claimId, "duplicate_claim_id", `Claim ID ${claim.claimId} is not unique.`));
    if (!claim.statement.trim()) issues.push(makeIssue(claim.claimId, "empty_statement", "A claim needs a visible statement."));

    const catalogNode = claim.catalogId ? getCatalogNode(claim.catalogId) : null;
    if (claim.catalogId && !catalogNode) issues.push(makeIssue(claim.claimId, "missing_catalog_node", `Catalog ID ${claim.catalogId} does not exist.`));
    if (claim.type === "family_narrowed") {
      if (!catalogNode || !["universal_family", "platform_archetype"].includes(catalogNode.kind)) {
        issues.push(makeIssue(claim.claimId, "catalog_level_mismatch", "A family narrowing claim must cite a family or platform archetype."));
      } else if (!state.candidateFamilies.some((family) => family.familyId === catalogNode.id && family.evidenceState === "live")) {
        issues.push(makeIssue(claim.claimId, "candidate_not_live", `${catalogNode.id} is not live in the current case.`));
      }
    }
    if (claim.type === "reason_hypothesis") {
      if (!catalogNode || catalogNode.kind !== "reason") {
        issues.push(makeIssue(claim.claimId, "catalog_level_mismatch", "A reason hypothesis must cite an individual reason."));
      } else if (!state.candidateReasons.some((reason) => reason.reasonId === catalogNode.id && ["live", "needs_observation"].includes(reason.evidenceState))) {
        issues.push(makeIssue(claim.claimId, "candidate_not_live", `${catalogNode.id} is not live in the current case.`));
      }
    }
    if (claim.type === "reason_supported") {
      issues.push(...validateReasonSupported(input.caseFile, state, claim, cardsByReasonId));
    }
    if (claim.type === "action" && !claim.evidenceEventIds.some((eventId) => getActiveAnswerEvents(input.caseFile).some((event) => event.eventId === eventId && event.questionId === "next-move"))) {
      issues.push(makeIssue(claim.claimId, "inactive_evidence", "An action claim must cite the active next-move answer."));
    }
    return { claimId: claim.claimId, valid: issues.length === 0, issues };
  });
  const issues = results.flatMap((result) => result.issues);
  return { valid: issues.length === 0, claims: results, issues };
}

export function applyValidatedReasonClaims(
  candidates: readonly CandidateReason[],
  claims: readonly DiagnosticClaim[],
  report: EvidenceValidationReport,
): CandidateReason[] {
  const validSupportedIds = new Set(claims
    .filter((claim) => claim.type === "reason_supported" && claim.catalogId && report.claims.some((result) => result.claimId === claim.claimId && result.valid))
    .map((claim) => claim.catalogId!));
  return candidates.map((candidate) => validSupportedIds.has(candidate.reasonId)
    ? { ...candidate, evidenceState: "supported" as const }
    : { ...candidate, supportingEventIds: [...candidate.supportingEventIds], weakeningEventIds: [...candidate.weakeningEventIds] });
}
