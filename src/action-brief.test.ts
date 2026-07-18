import { describe, expect, it } from "vitest";
import { actionBriefToMarkdown, compileActionBrief } from "./action-brief";
import { emptyAnswers } from "./types";

describe("Action Brief", () => {
  it("keeps unsupported research unresolved", () => {
    const brief = compileActionBrief({
      ...emptyAnswers,
      company: "Example team",
      platform: "Example API",
      developer: "Backend engineers",
      developerJob: "Receive a verified event",
      discriminatorQuestionId: "DQ_NO_ATTEMPT",
      discriminatorAnswerIds: ["unknown"],
    });

    expect(brief.researchStatus).toBe("needs_external_evidence");
    expect(brief.nextObservation).toContain("distinguish");
  });

  it("produces a portable human-readable brief without claiming a diagnosis", () => {
    const markdown = actionBriefToMarkdown(
      compileActionBrief({
        ...emptyAnswers,
        company: "Example team",
        platform: "Example API",
      }),
      "source-test",
    );

    expect(markdown).toContain("# First-Mile Action Brief");
    expect(markdown).toContain("not an established cause");
    expect(markdown).toContain("No intervention justified is a valid result");
  });

  it("marks an unrepresented platform surface as a catalog gap", () => {
    const brief = compileActionBrief({
      ...emptyAnswers,
      platform: "Specialized internal tool",
      platformSurfaces: ["Something else"],
      platformSurfaceOther: "A proprietary simulation environment",
    });
    expect(brief.researchStatus).toBe("catalog_gap");
    expect(brief.nextObservation).toContain("unrepresented developer surface");
  });

  it("preserves adaptive follow-up answers in the human-readable brief", () => {
    const brief = compileActionBrief({
      ...emptyAnswers,
      concern: "idk",
      adaptiveClarifications: { D1: "Developers do not begin an integration." },
    });
    const markdown = actionBriefToMarkdown(brief, "source-test");
    expect(brief.observedConcern).toBe("Developers do not begin an integration.");
    expect(markdown).toContain("## Clarifications");
    expect(markdown).toContain("D1: Developers do not begin an integration.");
  });

  it("preserves evidence-bounded adaptive narrowing and terminal context", () => {
    const brief = compileActionBrief({
      ...emptyAnswers,
      adaptiveCandidates: [{ catalogId: "U23", evidenceState: "needs_observation" }],
      adaptiveTerminalState: "needs_evidence",
    });
    const markdown = actionBriefToMarkdown(brief, "source-test");
    expect(brief.adaptiveResearchAreas[0]).toContain("needs observation");
    expect(markdown).toContain("Adaptive research areas:");
    expect(markdown).toContain("Adaptive stop state: needs evidence");
    expect(markdown).toContain("not an established cause");
  });
});
