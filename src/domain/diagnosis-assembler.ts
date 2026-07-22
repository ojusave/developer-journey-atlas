import { getCatalogNode } from "./catalog";
import { evaluateComparisonEligibility, type ComparisonRecord } from "./comparison-validation";
import {
  deriveDiagnosticState,
  evaluateStopCondition,
  getActiveAnswerForQuestion,
  getActiveAnswerEvents,
  type DiagnosticCase,
  type EvidenceKind,
} from "./diagnostic-engine";
import {
  evidenceKindPolicy,
  validateDiagnosticClaims,
  type DiagnosticClaim,
  type ReasonDiagnosticCard,
} from "./evidence-validation";

export interface AtlasJourneyRecord {
  recordType: "platform_journey";
  schemaVersion: number;
  id: string;
  platformId: string;
  canonicalRecordPath: string;
  platform: { name: string; slug: string; organization?: string };
  category: string;
  researchStatus: string;
  researchedAt: string;
  evidenceState: "documented" | "unresolved";
  diagnosisEligibility: "documented_path_only";
  developerGoal: string;
  firstMeaningfulSuccess: {
    normalized_outcome?: string;
    observable_completion_signal?: string;
    source_ids?: string[];
  };
  stages: Array<{
    step_number: number;
    action: string;
    source_ids?: string[];
  }>;
  frictionGates: Array<{
    at_step?: number;
    description?: string;
    requirement?: string;
    source_ids?: string[];
  }>;
  uncertainties: Array<{
    question: string;
    reason_unresolved?: string;
    impact?: string;
    checked_source_ids?: string[];
  }>;
  sources: Array<{ id: string; title: string; url: string }>;
  doesNotProve: string[];
}

export type DiagnosisAnalysisStatus =
  | "documented-path"
  | "candidate-risks"
  | "plausible-hypothesis"
  | "supported-hypothesis"
  | "insufficient-evidence"
  | "research-incomplete"
  | "platform-not-present";

export interface DiagnosisKnownClaim {
  statement: string;
  evidence_state: "documented" | "directly-observed" | "participant-reported" | "inferred" | "unresolved" | "contradicted";
  source_ids: string[];
}

export interface DiagnosisHypothesis {
  statement: string;
  blocker_ids: string[];
  evidence_state: "participant-reported" | "inferred" | "unresolved" | "contradicted" | "supported";
  source_ids: string[];
  evidence_event_ids: string[];
  evidence_kinds: EvidenceKind[];
  limitations: string[];
}

export interface DiagnosisComparison {
  summary: string | null;
  comparison_record_ids: string[];
  limitations: string[];
  analysis_eligible: boolean;
  minimum_comparison_count_met: boolean;
  pattern_claim_eligible: boolean;
  safe_to_anonymize: boolean;
  withheld_reasons: string[];
}

export interface DiagnosisOutput {
  schema_version: "2.0.0";
  platform_id: string;
  journey_id: string | null;
  analysis_mode: "documented-journey" | "specific-attempt";
  analysis_status: DiagnosisAnalysisStatus;
  headline: string;
  what_we_know: DiagnosisKnownClaim[];
  what_may_be_happening: DiagnosisHypothesis[];
  what_we_do_not_know: string[];
  next_check: string;
  comparison: DiagnosisComparison;
  source_ids: string[];
  limitations: string[];
}

export interface DiagnosisAssemblyInput {
  platform: string;
  journeyId?: string;
  journeys: readonly AtlasJourneyRecord[];
  caseFile?: DiagnosticCase;
  claims?: readonly DiagnosticClaim[];
  cards?: readonly ReasonDiagnosticCard[];
  comparison?: ComparisonRecord | null;
}

export class AtlasIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasIntegrityError";
  }
}

const comparisonAnalysisIntegrityCodes = new Set([
  "missing_goal_or_finish_line",
  "missing_structural_match",
  "missing_source_evidence",
  "missing_research_snapshot",
  "missing_peer",
  "incomplete_peer_values",
  "misclassified_matching_dimension",
  "missing_limitations",
  "declared_eligibility_mismatch",
  "declared_threshold_mismatch",
  "declared_pattern_mismatch",
]);

const comparisonPresentationIntegrityCodes = new Set([
  "unsafe_anonymization",
  "summary_present_when_withheld",
  "missing_withheld_reason",
  "unsupported_pattern_language",
]);

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function normalizedPlatformKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^platform:/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function platformIdForMissing(value: string): string {
  return `platform:${normalizedPlatformKey(value) || "unknown-platform"}`;
}

function namespacedSourceId(journey: AtlasJourneyRecord, sourceId: string): string {
  return `${journey.id}#${sourceId}`;
}

function sourceIdsFor(journey: AtlasJourneyRecord, sourceIds: readonly string[] | undefined): string[] {
  return unique((sourceIds ?? []).map((sourceId) => namespacedSourceId(journey, sourceId)));
}

function validateJourneyIntegrity(journeys: readonly AtlasJourneyRecord[]): void {
  const seenJourneyIds = new Set<string>();
  for (const journey of journeys) {
    if (seenJourneyIds.has(journey.id)) throw new AtlasIntegrityError(`Duplicate journey ID: ${journey.id}`);
    seenJourneyIds.add(journey.id);
    if (journey.platformId !== `platform:${journey.platform.slug}`) {
      throw new AtlasIntegrityError(`${journey.id} has a platform ID that does not match its canonical slug.`);
    }
    const sourceIds = new Set(journey.sources.map((source) => source.id));
    if (sourceIds.size !== journey.sources.length) {
      throw new AtlasIntegrityError(`${journey.id} contains duplicate source IDs.`);
    }
    const references = [
      ...(journey.firstMeaningfulSuccess.source_ids ?? []),
      ...journey.stages.flatMap((stage) => stage.source_ids ?? []),
      ...journey.frictionGates.flatMap((gate) => gate.source_ids ?? []),
      ...journey.uncertainties.flatMap((uncertainty) => uncertainty.checked_source_ids ?? []),
    ];
    const missing = unique(references.filter((sourceId) => !sourceIds.has(sourceId)));
    if (missing.length > 0) {
      throw new AtlasIntegrityError(`${journey.id} references missing source IDs: ${missing.join(", ")}`);
    }
  }
}

function resolveJourney(input: DiagnosisAssemblyInput): {
  platformId: string;
  journey: AtlasJourneyRecord | null;
  ambiguous: boolean;
} {
  const query = normalizedPlatformKey(input.platform);
  const matches = input.journeys.filter((journey) =>
    journey.platformId === input.platform
    || journey.platform.slug === input.platform
    || normalizedPlatformKey(journey.platform.name) === query
    || normalizedPlatformKey(journey.platform.slug) === query,
  );
  if (matches.length === 0) return { platformId: platformIdForMissing(input.platform), journey: null, ambiguous: false };
  const selected = input.journeyId ? matches.find((journey) => journey.id === input.journeyId) : null;
  if (input.journeyId && !selected) return { platformId: matches[0].platformId, journey: null, ambiguous: true };
  if (selected) return { platformId: selected.platformId, journey: selected, ambiguous: false };
  if (matches.length > 1) return { platformId: matches[0].platformId, journey: null, ambiguous: true };
  return { platformId: matches[0].platformId, journey: matches[0], ambiguous: false };
}

function emptyComparison(reason: string): DiagnosisComparison {
  return {
    summary: null,
    comparison_record_ids: [],
    limitations: ["No participant-facing comparison was produced."],
    analysis_eligible: false,
    minimum_comparison_count_met: false,
    pattern_claim_eligible: false,
    safe_to_anonymize: false,
    withheld_reasons: [reason],
  };
}

function assembleComparison(journeyId: string, record: ComparisonRecord | null | undefined): DiagnosisComparison {
  if (!record) return emptyComparison("No reviewed comparison record was supplied.");
  if (record.subject_journey_id !== journeyId) {
    return {
      ...emptyComparison("The comparison record does not belong to the selected journey."),
      comparison_record_ids: [record.comparison_id],
      limitations: unique(record.limitations),
    };
  }
  const report = evaluateComparisonEligibility(record);
  const analysisIntegrityIssues = report.issues.filter((issue) => comparisonAnalysisIntegrityCodes.has(issue.code));
  const presentationIntegrityIssues = report.issues.filter((issue) => comparisonPresentationIntegrityCodes.has(issue.code));
  const analysisEligible = report.analysisEligible && analysisIntegrityIssues.length === 0;
  const safeToAnonymize = record.safe_to_anonymize
    && !presentationIntegrityIssues.some((issue) => issue.code === "unsafe_anonymization");
  const summaryAllowed = analysisEligible && safeToAnonymize && record.participant_summary !== null;
  const withheldReasons = unique([
    ...record.withheld_reasons,
    ...analysisIntegrityIssues.map((issue) => issue.message),
    ...presentationIntegrityIssues.map((issue) => issue.message),
    ...(!summaryAllowed ? ["The comparison did not pass every participant-facing output gate."] : []),
  ]);
  return {
    summary: summaryAllowed ? record.participant_summary : null,
    comparison_record_ids: [record.comparison_id],
    limitations: unique(record.limitations),
    analysis_eligible: analysisEligible,
    minimum_comparison_count_met: report.minimumComparisonCountMet,
    pattern_claim_eligible: analysisEligible && report.patternClaimEligible,
    safe_to_anonymize: safeToAnonymize,
    withheld_reasons: withheldReasons,
  };
}

function evidenceKindsFor(caseFile: DiagnosticCase, eventIds: readonly string[]): EvidenceKind[] {
  const wanted = new Set(eventIds);
  return unique(getActiveAnswerEvents(caseFile)
    .filter((event) => wanted.has(event.eventId))
    .flatMap((event) => event.evidenceKinds)) as EvidenceKind[];
}

function knownEvidenceState(kinds: readonly EvidenceKind[]): DiagnosisKnownClaim["evidence_state"] {
  if (kinds.includes("direct_observation") || kinds.includes("product_data")) return "directly-observed";
  if (kinds.some((kind) => ["participant_report", "support_case", "developer_interview"].includes(kind))) return "participant-reported";
  if (kinds.some((kind) => ["team_anecdote", "assumption"].includes(kind))) return "inferred";
  return "unresolved";
}

function attributedStatement(statement: string, kinds: readonly EvidenceKind[]): string {
  if (kinds.includes("direct_observation")) return `Direct observation recorded: ${statement}`;
  if (kinds.includes("product_data")) return `Product or platform data recorded: ${statement}`;
  if (kinds.includes("support_case")) return `A support case recorded: ${statement}`;
  if (kinds.includes("developer_interview")) return `A developer interview reported: ${statement}`;
  if (kinds.includes("participant_report")) return `The participant reported: ${statement}`;
  if (kinds.includes("team_anecdote")) return `A team anecdote reported: ${statement}`;
  if (kinds.includes("assumption")) return `The current assumption is: ${statement}`;
  return `The case currently states: ${statement}`;
}

function hypothesisFromClaim(
  claim: DiagnosticClaim,
  caseFile: DiagnosticCase,
  cards: readonly ReasonDiagnosticCard[],
): DiagnosisHypothesis | null {
  if (!claim.catalogId || !["family_narrowed", "reason_hypothesis", "reason_supported"].includes(claim.type)) return null;
  const node = getCatalogNode(claim.catalogId);
  if (!node) return null;
  const supported = claim.type === "reason_supported";
  const card = supported ? cards.find((candidate) => candidate.reasonId === claim.catalogId) : null;
  const evidenceKinds = evidenceKindsFor(caseFile, claim.evidenceEventIds);
  const limitations = supported
    ? unique([
      ...(card?.limitations ?? []),
      "Supported for this attempt only. This is not a confirmed cause or a broader pattern.",
    ])
    : unique([
      "This is a research hypothesis, not a confirmed cause.",
      ...(node.diagnosticEligibility !== "diagnosis_eligible"
        ? ["This catalog item is not eligible to be presented as an individual diagnosis."]
        : []),
    ]);
  return {
    statement: supported
      ? `Supported hypothesis for this attempt: ${node.label}.`
      : node.kind === "reason"
        ? `Possible explanation to test: ${node.label}.`
        : `Research area narrowed by the attempt evidence: ${node.label}.`,
    blocker_ids: [`blocker:${node.id}`],
    evidence_state: supported ? "supported" : "inferred",
    source_ids: [`catalog:${node.id}`],
    evidence_event_ids: unique(claim.evidenceEventIds),
    evidence_kinds: evidenceKinds,
    limitations,
  };
}

function fallbackHypotheses(caseFile: DiagnosticCase): DiagnosisHypothesis[] {
  const state = deriveDiagnosticState(caseFile);
  const liveReasons = state.candidateReasons.filter((candidate) => candidate.evidenceState === "live");
  const liveFamilies = state.candidateFamilies.filter((candidate) => candidate.evidenceState === "live");
  return [...liveReasons, ...liveFamilies]
    .sort((left, right) => {
      const leftId = "reasonId" in left ? left.reasonId : left.familyId;
      const rightId = "reasonId" in right ? right.reasonId : right.familyId;
      return leftId.localeCompare(rightId);
    })
    .slice(0, 3)
    .map((candidate) => {
      const id = "reasonId" in candidate ? candidate.reasonId : candidate.familyId;
      const eventIds = unique(candidate.supportingEventIds);
      const reason = "reasonId" in candidate;
      return {
        statement: reason
          ? `Possible explanation to test: ${candidate.label}.`
          : `Research area narrowed by the attempt evidence: ${candidate.label}.`,
        blocker_ids: [`blocker:${id}`],
        evidence_state: "inferred" as const,
        source_ids: [`catalog:${id}`],
        evidence_event_ids: eventIds,
        evidence_kinds: evidenceKindsFor(caseFile, eventIds),
        limitations: [
          reason
            ? "This is a research hypothesis, not a confirmed cause."
            : "This is a research area, not an individual reason.",
          "Catalog routing does not establish occurrence, frequency, severity, or causation.",
          "The three-item display limit does not indicate likelihood or prevalence.",
        ],
      };
    });
}

function missingPlatformOutput(input: DiagnosisAssemblyInput, platformId: string): DiagnosisOutput {
  return {
    schema_version: "2.0.0",
    platform_id: platformId,
    journey_id: null,
    analysis_mode: input.caseFile ? "specific-attempt" : "documented-journey",
    analysis_status: "platform-not-present",
    headline: "This platform is not in the Atlas yet.",
    what_we_know: [],
    what_may_be_happening: [],
    what_we_do_not_know: ["No reviewed journey record matches the requested platform."],
    next_check: "Create a review-gated platform intake before producing a diagnosis.",
    comparison: emptyComparison("A comparison cannot be produced without a reviewed subject journey."),
    source_ids: [],
    limitations: ["The Atlas does not synthesize a journey or diagnosis when the platform is absent."],
  };
}

function ambiguousJourneyOutput(input: DiagnosisAssemblyInput, platformId: string): DiagnosisOutput {
  return {
    schema_version: "2.0.0",
    platform_id: platformId,
    journey_id: null,
    analysis_mode: input.caseFile ? "specific-attempt" : "documented-journey",
    analysis_status: "research-incomplete",
    headline: "Choose the developer goal before assembling this journey.",
    what_we_know: [],
    what_may_be_happening: [],
    what_we_do_not_know: ["More than one journey can match this platform, or the requested journey ID is not present."],
    next_check: "Select a reviewed journey ID that matches the developer's goal and surface.",
    comparison: emptyComparison("A comparison cannot be produced until one subject journey is selected."),
    source_ids: [],
    limitations: ["The assembler never silently selects among multiple developer journeys."],
  };
}

export function assembleDiagnosis(input: DiagnosisAssemblyInput): DiagnosisOutput {
  validateJourneyIntegrity(input.journeys);
  const resolved = resolveJourney(input);
  if (resolved.ambiguous) return ambiguousJourneyOutput(input, resolved.platformId);
  if (!resolved.journey) return missingPlatformOutput(input, resolved.platformId);

  const journey = resolved.journey;
  const caseFile = input.caseFile;
  const known: DiagnosisKnownClaim[] = [
    {
      statement: `The documented developer goal is: ${journey.developerGoal}`,
      evidence_state: journey.evidenceState,
      source_ids: [journey.id],
    },
  ];
  const finish = journey.firstMeaningfulSuccess.normalized_outcome?.trim();
  if (finish) {
    const finishSourceIds = sourceIdsFor(journey, journey.firstMeaningfulSuccess.source_ids);
    known.push({
      statement: `The documented finish line is: ${finish}`,
      evidence_state: "documented",
      source_ids: finishSourceIds.length > 0 ? finishSourceIds : [journey.id],
    });
  }
  known.push({
    statement: `The selected record contains ${journey.stages.length} documented stages and ${journey.frictionGates.length} documented requirement or transition gates.`,
    evidence_state: "documented",
    source_ids: [journey.id],
  });

  if (caseFile) {
    const lastTruth = getActiveAnswerForQuestion(caseFile, "last-truth");
    const statement = typeof lastTruth?.answer.lastTruth === "string" ? lastTruth.answer.lastTruth.trim() : "";
    if (lastTruth && statement) {
      known.push({
        statement: attributedStatement(statement, lastTruth.evidenceKinds),
        evidence_state: knownEvidenceState(lastTruth.evidenceKinds),
        source_ids: [lastTruth.eventId],
      });
    }
  }

  const cards = input.cards ?? [];
  const claims = input.claims ?? [];
  const claimReport = caseFile && claims.length > 0
    ? validateDiagnosticClaims({ caseFile, claims: [...claims], cards: [...cards] })
    : null;
  const validClaimIds = new Set(claimReport?.claims.filter((result) => result.valid).map((result) => result.claimId) ?? []);
  const hypotheses = caseFile
    ? (claims.length > 0
      ? claims
        .filter((claim) => validClaimIds.has(claim.claimId))
        .map((claim) => hypothesisFromClaim(claim, caseFile, cards))
        .filter((hypothesis): hypothesis is DiagnosisHypothesis => Boolean(hypothesis))
        .slice(0, 3)
      : fallbackHypotheses(caseFile))
    : [];

  const validAction = caseFile
    ? claims.find((claim) => claim.type === "action" && validClaimIds.has(claim.claimId))
    : null;
  const recordedNextMove = caseFile ? getActiveAnswerForQuestion(caseFile, "next-move") : null;
  const recordedNextMoveText = typeof recordedNextMove?.answer.nextMove === "string" ? recordedNextMove.answer.nextMove.trim() : "";
  const stopDecision = caseFile ? evaluateStopCondition(caseFile) : null;
  const nextCheck = validAction?.statement.trim()
    || recordedNextMoveText
    || stopDecision?.nextObservation
    || (caseFile
      ? "Observe one attempt and record the earliest transition that does not complete as documented."
      : "Use a specific attempt before testing any blocker hypothesis.");

  const unknowns = unique([
    ...journey.uncertainties.slice(0, 3).map((uncertainty) => uncertainty.question),
    ...(caseFile && hypotheses.length === 0 ? ["No blocker hypothesis passed the available evidence and routing gates."] : []),
    ...((claimReport?.claims.filter((result) => !result.valid).length ?? 0) > 0
      ? [`${claimReport!.claims.filter((result) => !result.valid).length} proposed diagnostic claim(s) did not pass the evidence contract.`]
      : []),
    ...(caseFile ? ["The available evidence does not establish a confirmed cause or a broader pattern."] : []),
  ]).slice(0, 5);

  const comparison = assembleComparison(journey.id, input.comparison);
  const supported = hypotheses.some((hypothesis) => hypothesis.evidence_state === "supported");
  const hasReasonHypothesis = hypotheses.some((hypothesis) => hypothesis.blocker_ids.some((id) => /^blocker:[UP]\d{2}\./.test(id)));
  const researchIncomplete = journey.researchStatus !== "complete" || journey.evidenceState !== "documented";
  const analysisStatus: DiagnosisAnalysisStatus = researchIncomplete
    ? "research-incomplete"
    : !caseFile
      ? "documented-path"
      : supported
        ? "supported-hypothesis"
        : hasReasonHypothesis
          ? "plausible-hypothesis"
          : hypotheses.length > 0
            ? "candidate-risks"
            : "insufficient-evidence";

  const activeEventIds = caseFile ? getActiveAnswerEvents(caseFile).map((event) => event.eventId) : [];
  const sourceIds = unique([
    journey.id,
    ...known.flatMap((claim) => claim.source_ids),
    ...hypotheses.flatMap((hypothesis) => hypothesis.source_ids),
    ...activeEventIds,
    ...(comparison.summary ? input.comparison?.source_ids ?? [] : []),
  ]);
  const weakAttributionKinds = caseFile
    ? getActiveAnswerEvents(caseFile).flatMap((event) => event.evidenceKinds).filter((kind) => evidenceKindPolicy[kind].requiresVisibleAttribution)
    : [];

  return {
    schema_version: "2.0.0",
    platform_id: journey.platformId,
    journey_id: journey.id,
    analysis_mode: caseFile ? "specific-attempt" : "documented-journey",
    analysis_status: analysisStatus,
    headline: researchIncomplete
      ? "The documented journey still has unresolved research."
      : supported
        ? "The evidence supports a bounded hypothesis for this attempt."
        : caseFile
          ? "The evidence narrows what to check, but it does not confirm a cause."
          : "This is the documented route, not a diagnosis of developer behavior.",
    what_we_know: known,
    what_may_be_happening: hypotheses,
    what_we_do_not_know: unknowns,
    next_check: nextCheck,
    comparison,
    source_ids: sourceIds,
    limitations: unique([
      ...journey.doesNotProve,
      "The assembler joins existing records without changing canonical journey or blocker data.",
      ...(weakAttributionKinds.length > 0 ? ["Participant, interview, support, or anecdotal evidence remains visibly attributed."] : []),
    ]),
  };
}
