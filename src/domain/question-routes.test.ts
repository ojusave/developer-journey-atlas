import { describe, expect, it } from "vitest";
import { emptyAnswers } from "../types";
import { explainSelection, selectDiscriminatorQuestion, validateQuestionRoutes } from "./question-routes";

describe("research-derived discriminator questions", () => {
  it("contains only resolvable catalog references and valuable answers", () => {
    expect(validateQuestionRoutes()).toEqual([]);
  });

  it("labels every current research question as family narrowing, not reason determination", () => {
    expect(selectDiscriminatorQuestion({ ...emptyAnswers, lastStage: "No attempt observed" }).diagnosticLevel).toBe("family_narrowing");
  });

  it.each([
    ["No attempt observed", "DQ_NO_ATTEMPT"],
    ["They found or evaluated the platform", "DQ_DISCOVERY_EVALUATION"],
    ["They tried to get access or approval", "DQ_ACCESS_GATE"],
    ["They started setup or implementation", "DQ_IMPLEMENTATION"],
    ["They produced a first result", "DQ_VERIFY"],
    ["They verified a meaningful result", "DQ_REPRESENTATIVE"],
    ["We cannot locate the stop yet", "DQ_MEASUREMENT"],
  ])("routes %s to %s", (lastStage, expectedQuestion) => {
    expect(selectDiscriminatorQuestion({ ...emptyAnswers, lastStage }).id).toBe(expectedQuestion);
  });

  it("does not turn absence of usage into a reliability diagnosis", () => {
    const question = selectDiscriminatorQuestion({ ...emptyAnswers, lastStage: "No attempt observed" });
    const result = explainSelection(question.id, ["none"])[0];
    expect(result.liveIds).toContain("U27.01");
    expect(result.liveIds).not.toContain("U18");
    expect(result.specialState).toBe("needs_external_evidence");
  });

  it("treats administrator and commercial gates as alternatives, not one generic access cause", () => {
    const question = selectDiscriminatorQuestion({ ...emptyAnswers, lastStage: "They tried to get access or approval" });
    expect(explainSelection(question.id, ["workspace"])[0].liveIds).toContain("U05.04");
    expect(explainSelection(question.id, ["commercial"])[0].liveIds).toContain("U06.16");
  });

  it("preserves compound blockers and legitimate gates as distinct non-diagnoses", () => {
    expect(explainSelection("DQ_NO_ATTEMPT", ["compound"])[0].specialState).toBe("compound_blockers");
    expect(explainSelection("DQ_ACCESS_GATE", ["expected_gate"])[0].specialState).toBe("legitimate_gate");
  });

  it.each([
    "DQ_NO_ATTEMPT",
    "DQ_DISCOVERY_EVALUATION",
    "DQ_ACCESS_GATE",
    "DQ_IMPLEMENTATION",
    "DQ_VERIFY",
    "DQ_REPRESENTATIVE",
    "DQ_MEASUREMENT",
  ])("keeps accessibility and inclusion observable in %s", (questionId) => {
    const result = explainSelection(questionId, ["accessibility_inclusion"])[0];
    expect(result.liveIds).toContain("U23");
    expect(result.nextObservation).toMatch(/affected|accessibility|excluded|context/i);
  });
});
