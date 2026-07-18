import { describe, expect, it } from "vitest";
import { friendlyCopy } from "../copy";
import { questionContracts } from "./question-contract";

describe("question contract", () => {
  it("covers every diagnostic objective", () => {
    const objectives = new Set(questionContracts.flatMap((contract) => contract.objectiveIds));
    for (let index = 1; index <= 10; index += 1) {
      expect(objectives.has(`D${index}`)).toBe(true);
    }
  });

  it("uses multiple choice only where conditions can coexist", () => {
    const multi = questionContracts.filter((contract) => contract.inputModes.includes("multi_choice"));
    expect(multi.map((contract) => contract.id).sort()).toEqual(["explanation-evidence", "profile-platform"]);
  });

  it("keeps cause discrimination tied to the catalog graph", () => {
    const discriminator = questionContracts.find((contract) => contract.id === "catalog-discriminator");
    expect(discriminator?.source).toBe("catalog_graph");
    expect(discriminator?.completionRule).toContain("external evidence");
  });

  it("avoids common synthetic filler in participant copy", () => {
    const participantCopy = JSON.stringify(friendlyCopy).toLowerCase();
    for (const phrase of ["great question", "great answer", "unlock insights", "delve", "seamless", "leverage ai", "journey together"]) {
      expect(participantCopy).not.toContain(phrase);
    }
  });
});
