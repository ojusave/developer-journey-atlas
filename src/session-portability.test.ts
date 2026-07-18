import { describe, expect, it } from "vitest";
import { emptyAnswers } from "./types";
import {
  createPortableCase,
  parsePortableCase,
  safeFilename,
  serializePortableCase,
} from "./session-portability";

describe("portable case", () => {
  it("round-trips without changing answers", () => {
    const answers = {
      ...emptyAnswers,
      company: "A team",
      meaningfulAction: "send one representative request",
      verificationSignal: "see the intended state change",
      furthestReachedStepId: "sign-up",
      breakStepId: "access",
      issueStatement: "Credentials require an approval the developer cannot request",
    };
    const portable = createPortableCase(answers, "source-test", new Date("2026-07-17T12:00:00.000Z"));
    const restored = parsePortableCase(serializePortableCase(portable));

    expect(restored).toEqual(portable);
    expect(restored.answers).toEqual(answers);
  });

  it("rejects unknown or incomplete formats", () => {
    expect(() => parsePortableCase('{"version":1}')).toThrow();
  });

  it("creates safe filenames", () => {
    expect(safeFilename("Zoom Developer Platform", "case")).toBe("zoom-developer-platform");
    expect(safeFilename("!!!", "case")).toBe("case");
  });
});
