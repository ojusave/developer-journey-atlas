import { describe, expect, it } from "vitest";
import diagnosisOutputSchema from "../../schemas/diagnosis-output.schema.json";
import reasonCardSchema from "../../schemas/reason-diagnostic-card.schema.json";
import type { CatalogNode } from "./catalog";
import { acceptAnswer, correctAnswer, createDiagnosticCase, deriveDiagnosticState, type EvidenceKind } from "./diagnostic-engine";
import {
  applyValidatedReasonClaims,
  evidenceKindPolicy,
  validateDiagnosticClaims,
  type DiagnosticClaim,
  type ReasonDiagnosticCard,
} from "./evidence-validation";

function narrowedCase(
  discriminatorEvidenceKinds: EvidenceKind[] = ["direct_observation"],
  stageEvidenceKinds: EvidenceKind[] = ["product_data"],
) {
  let caseFile = createDiagnosticCase("evidence-case");
  caseFile = acceptAnswer(caseFile, {
    eventId: "stage-1",
    questionId: "last-truth",
    answer: { lastStage: "No attempt observed", lastTruth: "No attempt appeared in the observed path." },
    evidenceKinds: stageEvidenceKinds,
  });
  caseFile = acceptAnswer(caseFile, {
    eventId: "disc-1",
    questionId: "catalog-discriminator",
    answer: { discriminatorQuestionId: "DQ_NO_ATTEMPT", discriminatorAnswerIds: ["planned_delayed"] },
    evidenceKinds: discriminatorEvidenceKinds,
  });
  return caseFile;
}

const reviewedCard = (overrides: Partial<ReasonDiagnosticCard> = {}): ReasonDiagnosticCard => ({
  reasonId: "U99.01",
  reviewState: "reviewed",
  reviewedAt: "2026-07-21T12:00:00.000Z",
  sourceIds: ["review:synthetic-case"],
  limitations: ["Synthetic test card. It is not a real catalog diagnosis."],
  observableImplication: "The observed attempt shows the specific distinction defined by this synthetic card.",
  prerequisites: [{ id: "viable-start", label: "A viable start existed", acceptedEvidenceKinds: ["product_data"] }],
  nearestLookalikeReasonIds: ["U99.02"],
  acceptedEvidenceKinds: ["direct_observation"],
  ...overrides,
});

const eligibleReason: CatalogNode = {
  id: "U99.01",
  kind: "reason",
  label: "Synthetic eligible reason",
  description: "Used only to exercise both evidence gates.",
  parentId: "U99",
  catalogMaturity: "reviewed",
  diagnosticEligibility: "diagnosis_eligible",
};

function syntheticState(caseFile: ReturnType<typeof narrowedCase>) {
  return {
    ...deriveDiagnosticState(caseFile),
    candidateReasons: [{
      reasonId: eligibleReason.id,
      label: eligibleReason.label,
      parentId: eligibleReason.parentId!,
      evidenceState: "live" as const,
      diagnosticEligibility: "diagnosis_eligible" as const,
      canBeReportedAsCause: true,
      supportingEventIds: ["disc-1"],
      weakeningEventIds: [],
    }],
  };
}

function supportedClaim(evidenceEventIds = ["disc-1"]): DiagnosticClaim {
  return {
    claimId: "supported-synthetic",
    type: "reason_supported",
    statement: "The synthetic reason is supported for this synthetic attempt.",
    catalogId: eligibleReason.id,
    evidenceEventIds,
    prerequisiteEvidence: { "viable-start": ["stage-1"] },
    lookalikeEvidence: { "U99.02": ["disc-1"] },
  };
}

function validateSynthetic(input: {
  caseFile?: ReturnType<typeof narrowedCase>;
  card?: ReasonDiagnosticCard;
  claim?: DiagnosticClaim;
}) {
  const caseFile = input.caseFile ?? narrowedCase();
  return validateDiagnosticClaims({
    caseFile,
    state: syntheticState(caseFile),
    cards: [input.card ?? reviewedCard()],
    claims: [input.claim ?? supportedClaim()],
    catalogLookup: (id) => id === eligibleReason.id ? eligibleReason : null,
  });
}

describe("diagnostic evidence validation", () => {
  it("accepts a family narrowing claim tied to the active discriminator answer", () => {
    const caseFile = narrowedCase();
    const report = validateDiagnosticClaims({
      caseFile,
      claims: [{ claimId: "claim-1", type: "family_narrowed", statement: "No-attempt conditions remain live.", catalogId: "U01", evidenceEventIds: ["disc-1"] }],
    });
    expect(report.valid).toBe(true);
  });

  it("allows an inventory reason as a hypothesis but never as a supported cause", () => {
    const caseFile = narrowedCase();
    const hypothesis: DiagnosticClaim = {
      claimId: "hypothesis-1",
      type: "reason_hypothesis",
      statement: "Competing work may have displaced the attempt.",
      catalogId: "U01.02",
      evidenceEventIds: ["disc-1"],
    };
    expect(validateDiagnosticClaims({ caseFile, claims: [hypothesis] }).valid).toBe(true);

    const card = reviewedCard({ reasonId: "U01.02", prerequisites: [], nearestLookalikeReasonIds: [] });
    const supported = { ...hypothesis, claimId: "supported-1", type: "reason_supported" as const };
    const report = validateDiagnosticClaims({ caseFile, claims: [supported], cards: [card] });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("reason_not_eligible");
    expect(applyValidatedReasonClaims(deriveDiagnosticState(caseFile).candidateReasons, [supported], report).some((reason) => reason.evidenceState === "supported")).toBe(false);
  });

  it("accepts a synthetic supported reason only when both eligibility gates pass", () => {
    const caseFile = narrowedCase();
    const claim = supportedClaim();
    const report = validateSynthetic({ caseFile, claim });
    expect(report).toEqual({ valid: true, claims: [{ claimId: claim.claimId, valid: true, issues: [] }], issues: [] });
    expect(applyValidatedReasonClaims(syntheticState(caseFile).candidateReasons, [claim], report)[0].evidenceState).toBe("supported");
  });

  it("rejects a missing, draft, or provenance-free diagnostic card", () => {
    const caseFile = narrowedCase();
    const missing = validateDiagnosticClaims({
      caseFile,
      state: syntheticState(caseFile),
      claims: [supportedClaim()],
      catalogLookup: (id) => id === eligibleReason.id ? eligibleReason : null,
    });
    expect(missing.issues.map((issue) => issue.code)).toContain("diagnostic_card_missing");

    const incomplete = validateSynthetic({
      caseFile,
      card: reviewedCard({ reviewState: "draft", reviewedAt: null, sourceIds: [] }),
    });
    expect(incomplete.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "diagnostic_card_unreviewed",
      "diagnostic_card_missing_provenance",
    ]));
  });

  it("rejects evidence after the cited answer is corrected", () => {
    let caseFile = narrowedCase();
    caseFile = correctAnswer(caseFile, {
      eventId: "disc-2",
      correctsEventId: "disc-1",
      questionId: "catalog-discriminator",
      answer: { discriminatorQuestionId: "DQ_NO_ATTEMPT", discriminatorAnswerIds: ["saw_no_fit"] },
      evidenceKinds: ["direct_observation"],
    });
    const report = validateDiagnosticClaims({
      caseFile,
      claims: [{ claimId: "claim-2", type: "family_narrowed", statement: "No-attempt conditions remain live.", catalogId: "U01", evidenceEventIds: ["disc-1"] }],
    });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("inactive_evidence");
  });

  it("requires prerequisite and nearest-lookalike evidence for a supported reason", () => {
    const report = validateSynthetic({
      claim: { ...supportedClaim(), prerequisiteEvidence: {}, lookalikeEvidence: {} },
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["prerequisite_not_tested", "lookalike_not_tested"]));
  });
});

describe("evidence-kind policy", () => {
  it("keeps schema support kinds aligned with the runtime policy", () => {
    const runtimeSupportKinds = Object.entries(evidenceKindPolicy)
      .filter(([, policy]) => policy.canSupportReason)
      .map(([kind]) => kind)
      .sort();
    const cardSupportKinds = [...reasonCardSchema.$defs.support_evidence_kind.enum].sort();
    const outputSupportKinds = [...(diagnosisOutputSchema.properties.what_may_be_happening.items.allOf[0].then.properties.evidence_kinds.contains.enum ?? [])].sort();
    expect(cardSupportKinds).toEqual(runtimeSupportKinds);
    expect(outputSupportKinds).toEqual(runtimeSupportKinds);
  });

  it.each(["assumption", "none", "team_anecdote"] as const)("does not let %s independently support a reason", (kind) => {
    const report = validateSynthetic({ caseFile: narrowedCase([kind]) });
    expect(report.issues.map((issue) => issue.code)).toContain("insufficient_evidence_kind");
  });

  it("does not turn multiple weak signals into support", () => {
    const caseFile = narrowedCase(["team_anecdote"], ["assumption"]);
    const report = validateSynthetic({ caseFile, claim: supportedClaim(["stage-1", "disc-1"]) });
    expect(report.issues.map((issue) => issue.code)).toContain("insufficient_evidence_kind");
  });

  it("keeps participant reports attributed and below independent support", () => {
    expect(evidenceKindPolicy.participant_report).toMatchObject({
      canSupportReason: false,
      requiresVisibleAttribution: true,
    });
    const report = validateSynthetic({ caseFile: narrowedCase(["participant_report"]) });
    expect(report.issues.map((issue) => issue.code)).toContain("insufficient_evidence_kind");
  });

  it("rejects a card that attempts to approve a weak evidence kind", () => {
    const report = validateSynthetic({ card: reviewedCard({ acceptedEvidenceKinds: ["assumption"] }) });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "unsupported_card_evidence_kind",
      "insufficient_evidence_kind",
    ]));
  });

  it("requires usable evidence when a lookalike is addressed", () => {
    const caseFile = narrowedCase(["direct_observation"], ["assumption"]);
    const report = validateSynthetic({
      caseFile,
      card: reviewedCard({ prerequisites: [] }),
      claim: { ...supportedClaim(), prerequisiteEvidence: {}, lookalikeEvidence: { "U99.02": ["stage-1"] } },
    });
    expect(report.issues.map((issue) => issue.code)).toContain("insufficient_lookalike_evidence_kind");
  });
});
