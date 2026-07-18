// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assessObjectiveAnswer } from "./objective-assessment.js";

describe("deterministic objective assessment", () => {
  it("does not accept an uncertainty fragment as the concerning behavior", () => {
    const assessment = assessObjectiveAnswer("D1", { kind: "text", text: "idk\nObserved pattern: Something else" }, 0);
    expect(assessment.answered).toBe(false);
    expect(assessment.followUp?.objectiveId).toBe("D1");
    expect(assessment.reflection).not.toContain("observation");
  });

  it("rejects a generic developer and platform action as a developer job", () => {
    const assessment = assessObjectiveAnswer("D3", {
      kind: "text",
      text: "Developer: developers\nActor: A person\nJob: use our platform",
    }, 0);
    expect(assessment.answered).toBe(false);
    expect(assessment.followUp?.prompt).toContain("trying to accomplish");
  });

  it("accepts a cohort and an outcome-oriented developer job", () => {
    const assessment = assessObjectiveAnswer("D3", {
      kind: "text",
      text: "Developer: backend engineers at financial institutions\nActor: A person\nJob: receive a verified meeting event in their monitoring service",
    }, 0);
    expect(assessment.answered).toBe(true);
  });

  it("asks for a developer-verifiable result when only a product event is named", () => {
    const assessment = assessObjectiveAnswer("D4", {
      kind: "text",
      text: "Created an API key\nMilestone check: A product event, such as signup, key creation, or first request",
    }, 0);
    expect(assessment.answered).toBe(false);
    expect(assessment.followUp?.prompt).toContain("verify");
  });

  it("stops repeating after the objective follow-up budget is exhausted", () => {
    const assessment = assessObjectiveAnswer("D1", { kind: "text", text: "idk" }, 2);
    expect(assessment.answered).toBe(false);
    expect(assessment.followUp).not.toBeNull();
  });
});
