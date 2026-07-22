export const comparisonDimensionNames = [
  "platform-archetype",
  "developer-goal",
  "finish-line",
  "authentication-model",
  "credential-model",
  "setup-surface",
  "execution-model",
  "first-operation",
  "success-verification",
  "account-gate",
  "entitlement-gate",
  "branch-complexity",
] as const;

export type ComparisonDimensionName = typeof comparisonDimensionNames[number];

export interface ComparisonDimension {
  name: ComparisonDimensionName;
  subject_value: string;
  peer_values: string[];
  source_ids: string[];
}

export interface ComparisonResearchSnapshot {
  journey_id: string;
  researched_at: string;
}

export interface ComparisonRecord {
  comparison_id: string;
  subject_journey_id: string;
  peer_journey_ids: string[];
  matching_dimensions: ComparisonDimension[];
  differing_dimensions: ComparisonDimension[];
  source_ids: string[];
  limitations: string[];
  research_snapshots: ComparisonResearchSnapshot[];
  analysis_eligible: boolean;
  minimum_comparison_count_met: boolean;
  pattern_claim_eligible: boolean;
  safe_to_anonymize: boolean;
  participant_summary: string | null;
  withheld_reasons: string[];
}

export type ComparisonIssueCode =
  | "missing_goal_or_finish_line"
  | "missing_structural_match"
  | "missing_source_evidence"
  | "missing_research_snapshot"
  | "missing_peer"
  | "incomplete_peer_values"
  | "misclassified_matching_dimension"
  | "missing_limitations"
  | "insufficient_peer_count_for_pattern"
  | "unsafe_anonymization"
  | "summary_present_when_withheld"
  | "missing_withheld_reason"
  | "declared_eligibility_mismatch"
  | "declared_threshold_mismatch"
  | "declared_pattern_mismatch"
  | "unsupported_pattern_language";

export interface ComparisonIssue {
  code: ComparisonIssueCode;
  message: string;
}

export interface ComparisonEligibilityReport {
  analysisEligible: boolean;
  minimumComparisonCountMet: boolean;
  patternClaimEligible: boolean;
  participantSummaryAllowed: boolean;
  issues: ComparisonIssue[];
}

const comparisonBoundaryDimensions = new Set<ComparisonDimensionName>(["developer-goal", "finish-line"]);
const structuralDimensions = new Set<ComparisonDimensionName>([
  "authentication-model",
  "credential-model",
  "setup-surface",
  "execution-model",
  "first-operation",
  "success-verification",
  "account-gate",
  "entitlement-gate",
  "branch-complexity",
]);
const broadPatternLanguage = /\b(?:usually|typically|most|common|generally|performs?\s+(?:better|worse))\b/i;
const prohibitedComparativeLanguage = /\b(?:most platforms|similar platforms usually|performs?\s+(?:better|worse))\b/i;

function validDate(value: string): boolean {
  return value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

export function evaluateComparisonEligibility(record: ComparisonRecord): ComparisonEligibilityReport {
  const issues: ComparisonIssue[] = [];
  const matchingNames = new Set(record.matching_dimensions.map((dimension) => dimension.name));
  const hasBoundaryMatch = [...matchingNames].some((name) => comparisonBoundaryDimensions.has(name));
  const hasStructuralMatch = [...matchingNames].some((name) => structuralDimensions.has(name));
  const comparedJourneyIds = new Set([record.subject_journey_id, ...record.peer_journey_ids]);
  const snapshotIds = new Set(record.research_snapshots.filter((snapshot) => validDate(snapshot.researched_at)).map((snapshot) => snapshot.journey_id));
  const dimensions = [...record.matching_dimensions, ...record.differing_dimensions];
  const hasSourceEvidence = record.source_ids.length > 0
    && dimensions.length > 0
    && dimensions.every((dimension) => dimension.source_ids.length > 0);
  const peerValuesComplete = dimensions.every((dimension) => dimension.peer_values.length === record.peer_journey_ids.length);
  const matchingValuesAgree = record.matching_dimensions.every((dimension) =>
    dimension.peer_values.every((value) => value === dimension.subject_value),
  );

  if (record.peer_journey_ids.length === 0) {
    issues.push({ code: "missing_peer", message: "A comparison needs at least one qualified peer journey." });
  }

  if (!hasBoundaryMatch) {
    issues.push({ code: "missing_goal_or_finish_line", message: "Comparable journeys must share a declared developer goal or finish line." });
  }
  if (!hasStructuralMatch) {
    issues.push({ code: "missing_structural_match", message: "A platform archetype or industry label alone is not a material structural match." });
  }
  if (!hasSourceEvidence) {
    issues.push({ code: "missing_source_evidence", message: "Every compared dimension and the record itself must cite source evidence." });
  }
  if (!peerValuesComplete) {
    issues.push({ code: "incomplete_peer_values", message: "Every dimension must provide exactly one value for each qualified peer." });
  }
  if (!matchingValuesAgree) {
    issues.push({ code: "misclassified_matching_dimension", message: "A declared matching dimension contains a peer value that differs from the subject value." });
  }
  if (record.limitations.length === 0) {
    issues.push({ code: "missing_limitations", message: "Comparison limitations must remain visible." });
  }
  if ([...comparedJourneyIds].some((journeyId) => !snapshotIds.has(journeyId))) {
    issues.push({ code: "missing_research_snapshot", message: "The subject and every peer need an explicit research date. No freshness cutoff is inferred." });
  }

  const minimumComparisonCountMet = record.peer_journey_ids.length >= 3;
  if (!minimumComparisonCountMet) {
    issues.push({ code: "insufficient_peer_count_for_pattern", message: "Fewer than three qualified peers can support only a bounded comparison, not a broader pattern claim." });
  }
  const analysisEligible = hasBoundaryMatch
    && hasStructuralMatch
    && hasSourceEvidence
    && record.peer_journey_ids.length > 0
    && peerValuesComplete
    && matchingValuesAgree
    && record.limitations.length > 0
    && [...comparedJourneyIds].every((journeyId) => snapshotIds.has(journeyId));
  const participantSummaryAllowed = analysisEligible && record.safe_to_anonymize;
  const patternClaimEligible = analysisEligible && minimumComparisonCountMet;

  if (!record.safe_to_anonymize) {
    issues.push({ code: "unsafe_anonymization", message: "Participant-facing comparison is withheld because anonymization has not been established as safe." });
  }
  if (!participantSummaryAllowed && record.participant_summary !== null) {
    issues.push({ code: "summary_present_when_withheld", message: "Participant-facing summary must be null when analysis or anonymization is ineligible." });
  }
  if (record.participant_summary && (
    prohibitedComparativeLanguage.test(record.participant_summary)
    || (!patternClaimEligible && broadPatternLanguage.test(record.participant_summary))
  )) {
    issues.push({ code: "unsupported_pattern_language", message: "Bounded comparison output cannot use broad prevalence or performance language." });
  }

  if ((!participantSummaryAllowed || !minimumComparisonCountMet) && record.withheld_reasons.length === 0) {
    issues.push({ code: "missing_withheld_reason", message: "A withheld summary or pattern claim needs a visible reason." });
  }

  if (record.analysis_eligible !== analysisEligible) {
    issues.push({ code: "declared_eligibility_mismatch", message: "The declared analysis eligibility does not match the evidence-derived result." });
  }
  if (record.minimum_comparison_count_met !== minimumComparisonCountMet) {
    issues.push({ code: "declared_threshold_mismatch", message: "The declared peer-count threshold does not match the qualified peer count." });
  }
  if (record.pattern_claim_eligible !== patternClaimEligible) {
    issues.push({ code: "declared_pattern_mismatch", message: "The declared pattern eligibility does not match analysis eligibility and peer count." });
  }

  return {
    analysisEligible,
    minimumComparisonCountMet,
    patternClaimEligible,
    participantSummaryAllowed,
    issues,
  };
}
