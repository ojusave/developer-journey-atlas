import { describe, expect, it } from "vitest";
import { acceptAnswer, correctAnswer, createDiagnosticCase, deriveDiagnosticState } from "./diagnostic-engine";
import { applyValidatedReasonClaims, validateDiagnosticClaims, type DiagnosticClaim, type ReasonDiagnosticCard } from "./evidence-validation";

function narrowedCase() {
  let caseFile = createDiagnosticCase("evidence-case");
  caseFile = acceptAnswer(caseFile, {
    eventId: "stage-1",
    questionId: "last-truth",
    answer: { lastStage: "No attempt observed", lastTruth: "No attempt appeared in the observed path." },
    evidenceKinds: ["product_data"],
  });
  caseFile = acceptAnswer(caseFile, {
    eventId: "disc-1",
    questionId: "catalog-discriminator",
    answer: { discriminatorQuestionId: "DQ_NO_ATTEMPT", discriminatorAnswerIds: ["planned_delayed"] },
    evidenceKinds: ["direct_observation"],
  });
  return caseFile;
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

    const card: ReasonDiagnosticCard = {
      reasonId: "U01.02",
      reviewState: "reviewed",
      observableImplication: "The developer explicitly selects another assigned task despite having a viable start.",
      prerequisites: [],
      nearestLookalikeReasonIds: [],
      acceptedEvidenceKinds: ["direct_observation"],
    };
    const supported = { ...hypothesis, claimId: "supported-1", type: "reason_supported" as const };
    const report = validateDiagnosticClaims({ caseFile, claims: [supported], cards: [card] });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("reason_not_eligible");
    expect(applyValidatedReasonClaims(deriveDiagnosticState(caseFile).candidateReasons, [supported], report).some((reason) => reason.evidenceState === "supported")).toBe(false);
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
    const caseFile = narrowedCase();
    const card: ReasonDiagnosticCard = {
      reasonId: "U01.02",
      reviewState: "reviewed",
      observableImplication: "The developer selects another assigned task.",
      prerequisites: [{ id: "viable-start", label: "A viable starting path existed", acceptedEvidenceKinds: ["direct_observation"] }],
      nearestLookalikeReasonIds: ["U01.03"],
      acceptedEvidenceKinds: ["direct_observation"],
    };
    const report = validateDiagnosticClaims({
      caseFile,
      cards: [card],
      claims: [{ claimId: "claim-3", type: "reason_supported", statement: "Competing work displaced the attempt.", catalogId: "U01.02", evidenceEventIds: ["disc-1"] }],
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["reason_not_eligible", "prerequisite_not_tested", "lookalike_not_tested"]));
  });
});
