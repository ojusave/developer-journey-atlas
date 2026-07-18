import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession } from "./storage";
import { emptyAnswers } from "./types";

describe("browser session storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a current session", () => {
    saveSession({
      version: 1,
      guidanceMode: "adaptive",
      screen: "concern",
      history: ["welcome", "name", "company", "platform", "role"],
      answers: { ...emptyAnswers, concern: "No attempts" },
      updatedAt: "2026-07-17T12:00:00.000Z",
    });

    expect(loadSession()?.answers.concern).toBe("No attempts");
    expect(loadSession()?.guidanceMode).toBe("adaptive");
  });

  it("migrates a saved case created before the seven-day fields existed", () => {
    const oldAnswers = { ...emptyAnswers } as Partial<typeof emptyAnswers>;
    delete oldAnswers.reviewDate;
    delete oldAnswers.reviewNotes;
    delete oldAnswers.reviewDecision;
    window.localStorage.setItem("first-mile-scanner/session/v1", JSON.stringify({
      version: 1,
      screen: "summary",
      history: [],
      answers: oldAnswers,
      updatedAt: "2026-07-17T12:00:00.000Z",
    }));

    const restored = loadSession();
    expect(restored?.answers.reviewDate).toBe("");
    expect(restored?.answers.reviewNotes).toBe("");
    expect(restored?.answers.reviewDecision).toBe("");
    expect(restored?.guidanceMode).toBe("guided");
  });

  it("clears the local case", () => {
    saveSession({ version: 1, guidanceMode: "guided", screen: "welcome", history: [], answers: emptyAnswers, updatedAt: new Date(0).toISOString() });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
