import { describe, expect, it } from "vitest";
import { emptyAnswers } from "../types";
import { guidedAnswerQualityMessage } from "./answer-quality";

describe("guided answer quality", () => {
  it("does not accept idk as a concerning behavior", () => {
    expect(guidedAnswerQualityMessage("concern", { ...emptyAnswers, concern: "idk" })).toContain("behavior");
  });

  it("does not accept a generic platform action as the developer job", () => {
    expect(guidedAnswerQualityMessage("developer-job", { ...emptyAnswers, developerJob: "use our platform" })).toContain("accomplish");
  });

  it("accepts a specific outcome-oriented developer job", () => {
    expect(guidedAnswerQualityMessage("developer-job", {
      ...emptyAnswers,
      developerJob: "Receive a verified meeting event in their monitoring service",
    })).toBeNull();
  });
});
