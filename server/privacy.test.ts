// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EnvelopeCipher, hashInput, stableJson } from "./privacy.js";
import { InMemoryDiagnosticStore } from "./store.js";
import { DiagnosticCatalog } from "./catalog.js";

describe("privacy primitives", () => {
  it("round trips an authenticated encrypted envelope", () => {
    const cipher = new EnvelopeCipher(Buffer.alloc(32, 3));
    const value = { answer: "A participant answer", optionIds: ["one"] };
    const encrypted = cipher.encrypt(value);
    expect(encrypted.ciphertext).not.toContain(value.answer);
    expect(cipher.decrypt(encrypted)).toEqual(value);
  });

  it("creates the same input hash regardless of object key order", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    const key = Buffer.alloc(32, 7);
    expect(hashInput({ b: 2, a: 1 }, key)).toBe(hashInput({ a: 1, b: 2 }, key));
    expect(hashInput({ a: 1 }, key)).not.toBe(hashInput({ a: 1 }, Buffer.alloc(32, 8)));
  });

  it("purges expired sessions from the runtime store", async () => {
    const store = new InMemoryDiagnosticStore();
    await store.createSession({
      id: "019f71fe-d47c-7963-8b86-b59ee39c1ae2",
      tokenHash: "token-hash",
      catalogVersion: "test",
      context: { platformArchetypeIds: [] },
      state: {
        schemaVersion: 1,
        catalogVersion: "test",
        revision: 0,
        answeredObjectiveIds: [],
        objectiveAttempts: {},
        candidates: [],
        acceptedTurnIds: [],
        turnObjectives: {},
        retractedTurnIds: [],
        lastReflection: null,
        nextQuestion: null,
        terminalState: null,
      },
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await store.purgeExpired()).toEqual({ sessionsDeleted: 1, envelopesCleared: 0 });
    expect(await store.getSessionInternal("019f71fe-d47c-7963-8b86-b59ee39c1ae2")).toBeNull();
  });

  it("supplies a complete compact research index on every server turn", () => {
    const catalog = DiagnosticCatalog.fromDefaultPath();
    const packet = catalog.packetFor({
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: 0,
      answeredObjectiveIds: [],
      objectiveAttempts: {},
      candidates: [],
      acceptedTurnIds: [],
      turnObjectives: {},
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: null,
      terminalState: null,
    }, { platformArchetypeIds: [] });

    expect(packet.completeIndex.universalFamilies).toHaveLength(28);
    expect(packet.completeIndex.platformArchetypes).toHaveLength(16);
    expect(packet.completeIndex.journeys).toHaveLength(8);
    expect(packet.completeIndex.specialStates).toContain("catalog_gap");
  });

  it("supplies selected platform reason cards only for catalog discrimination", () => {
    const catalog = DiagnosticCatalog.fromDefaultPath();
    const state = {
      schemaVersion: 1 as const,
      catalogVersion: catalog.version,
      revision: 0,
      answeredObjectiveIds: [],
      objectiveAttempts: {},
      candidates: [],
      acceptedTurnIds: [],
      turnObjectives: {},
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: null,
      terminalState: null,
    };
    const early = catalog.packetFor(state, { platformArchetypeIds: ["P04"] }, "D1");
    const discrimination = catalog.packetFor(state, { platformArchetypeIds: ["P04"] }, "D8");
    expect(early.nodes.some((node) => node.id === "P04.11")).toBe(false);
    expect(discrimination.nodes.some((node) => node.id === "P04.11")).toBe(true);
    expect(discrimination.allowedCatalogIds).toContain("P04.11");
  });

  it("never silently truncates the complete reason set for selected platform archetypes", () => {
    const catalog = DiagnosticCatalog.fromDefaultPath();
    const state = {
      schemaVersion: 1 as const,
      catalogVersion: catalog.version,
      revision: 0,
      answeredObjectiveIds: [],
      objectiveAttempts: {},
      candidates: [],
      acceptedTurnIds: [],
      turnObjectives: {},
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: null,
      terminalState: null,
    };
    const archetypeIds = ["P04", "P06", "P16", "P01", "P02", "P03", "P09", "P10"];
    const packet = catalog.packetFor(state, { platformArchetypeIds: archetypeIds }, "D8");
    const packetIds = new Set(packet.nodes.map((node) => node.id));
    for (const archetypeId of archetypeIds) {
      const expectedReasonIds = catalog.reasonIdsForParent(archetypeId);
      expect(expectedReasonIds.length).toBeGreaterThan(0);
      expect(expectedReasonIds.every((reasonId) => packetIds.has(reasonId))).toBe(true);
    }
  });
});
