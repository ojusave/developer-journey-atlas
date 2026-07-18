// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DiagnosticState, TurnEnvelope } from "./domain.js";
import type { TurnProposal } from "./reasoner.js";
import { createTestService } from "./test-runtime.js";
import { validateAndApplyProposal } from "./validator.js";
import { defaultQuestionFor } from "./objective-policy.js";

describe("deterministic proposal validation", () => {
  it("blocks an individual reason that has no reviewed diagnostic card", () => {
    const { catalog } = createTestService();
    const turnId = randomUUID();
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: 6,
      answeredObjectiveIds: ["D1", "D3", "D4", "D5", "D6", "D7"],
      objectiveAttempts: {},
      candidates: [],
      acceptedTurnIds: [],
      turnObjectives: {},
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: null,
      terminalState: null,
    };
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId,
      revision: 7,
      objectiveId: "D8",
      answer: { kind: "text", text: "We saw one developer fail." },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "That supports one specific reason.",
      answeredCurrentObjective: true,
      candidateUpdates: [{ catalogId: "U00.01", evidenceState: "live", evidenceTurnIds: [turnId] }],
      nextStep: { kind: "stop", terminalState: "hypothesis_ready" },
    };
    const validated = validateAndApplyProposal(catalog, {
      catalogVersion: catalog.version,
      completeIndex: {
        universalFamilies: [],
        platformArchetypes: [],
        journeys: [],
        specialStates: [],
      },
      nodes: [],
      allowedCatalogIds: ["U00.01"],
    }, state, envelope, proposal);

    expect(validated.warnings).toContain("Reason U00.01 is not diagnosis eligible and cannot be marked live");
    expect(validated.state.candidates).toEqual([]);
    expect(validated.reflection).toContain("not supported");
  });

  it("blocks platform and journey IDs from becoming blocker candidates", () => {
    const { catalog } = createTestService();
    const turnId = randomUUID();
    const state: DiagnosticState = {
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
    };
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId,
      revision: 1,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not begin." },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "The API surface is the blocker.",
      answeredCurrentObjective: true,
      candidateUpdates: [{ catalogId: "P04", evidenceState: "live", evidenceTurnIds: [turnId] }],
      nextStep: { kind: "question", ...{
        objectiveId: "D3" as const,
        prompt: "Which developers are included in this observation?",
        support: "A coherent cohort keeps the case specific.",
        inputMode: "text" as const,
        options: [],
      } },
    };
    const packet = catalog.packetFor(state, { platformArchetypeIds: ["P04"] });
    const validated = validateAndApplyProposal(catalog, packet, state, envelope, proposal);

    expect(validated.warnings).toContain("Catalog ID P04 is not a blocker family or reason");
    expect(validated.state.candidates).toEqual([]);
  });

  it("blocks unsupported causal claims in participant-visible reflections", () => {
    const { catalog } = createTestService();
    const turnId = randomUUID();
    const state: DiagnosticState = {
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
    };
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId,
      revision: 1,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not begin the evaluation." },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "The API platform is the blocker.",
      answeredCurrentObjective: true,
      candidateUpdates: [],
      nextStep: { kind: "question", objectiveId: "D3", prompt: "Which developers are included?", support: "Use one coherent cohort for this case.", inputMode: "text", options: [] },
    };
    const validated = validateAndApplyProposal(catalog, catalog.packetFor(state, { platformArchetypeIds: ["P04"] }), state, envelope, proposal);
    expect(validated.warnings).toContain("Reflection makes an unsupported causal claim");
    expect(validated.reflection).toContain("not supported");
  });

  it("replaces untrusted model prose with an evidence-bounded reflection", () => {
    const { catalog } = createTestService();
    const turnId = randomUUID();
    const state: DiagnosticState = {
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
    };
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId,
      revision: 1,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not begin the evaluation." },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "The platform blocks these developers before they can begin.",
      answeredCurrentObjective: true,
      candidateUpdates: [],
      nextStep: { kind: "question", objectiveId: "D3", prompt: "Which developers are included?", support: "Use one coherent cohort for this case.", inputMode: "text", options: [] },
    };

    const validated = validateAndApplyProposal(catalog, catalog.packetFor(state, { platformArchetypeIds: ["P04"] }), state, envelope, proposal);
    expect(validated.warnings).toEqual([]);
    expect(validated.reflection).toContain("clearer boundary");
    expect(validated.reflection).not.toContain("platform blocks");
    expect(validated.state.lastReflection).toBe(validated.reflection);
  });

  it("does not allow a diagnostic terminal state to skip ownership and the next move", () => {
    const { catalog } = createTestService();
    const objectiveIds = ["D1", "D3", "D4", "D5", "D6", "D7", "D8"] as const;
    const turnIds = objectiveIds.map(() => randomUUID());
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: turnIds.length,
      answeredObjectiveIds: [...objectiveIds],
      objectiveAttempts: Object.fromEntries(objectiveIds.map((id) => [id, 1])),
      candidates: [],
      acceptedTurnIds: turnIds,
      turnObjectives: Object.fromEntries(turnIds.map((id, index) => [id, objectiveIds[index]])),
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: null,
      terminalState: null,
    };
    const finalTurnId = randomUUID();
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId: finalTurnId,
      revision: turnIds.length + 1,
      objectiveId: "D8",
      answer: { kind: "unknown" },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "The evidence cannot separate the remaining explanations.",
      answeredCurrentObjective: true,
      candidateUpdates: [],
      nextStep: { kind: "stop", terminalState: "needs_evidence" },
    };
    const validated = validateAndApplyProposal(catalog, catalog.packetFor(state, { platformArchetypeIds: [] }), state, envelope, proposal);
    expect(validated.warnings).toContain("needs_evidence requires the evidence-producing next-move objective");
    expect(validated.state.nextQuestion?.objectiveId).toBe("D9");
    expect(validated.state.terminalState).toBeNull();
  });

  it("invalidates downstream answers when an early objective is corrected", () => {
    const { catalog } = createTestService();
    const objectiveIds = ["D1", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"] as const;
    const turnIds = objectiveIds.map(() => randomUUID());
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: turnIds.length,
      answeredObjectiveIds: [...objectiveIds],
      objectiveAttempts: Object.fromEntries(objectiveIds.map((id) => [id, 1])),
      candidates: [{ catalogId: "U01", evidenceState: "live", evidenceTurnIds: [turnIds[6]] }],
      acceptedTurnIds: turnIds,
      turnObjectives: Object.fromEntries(turnIds.map((id, index) => [id, objectiveIds[index]])),
      retractedTurnIds: [],
      lastReflection: "A prior conclusion",
      nextQuestion: null,
      terminalState: "action_ready",
    };
    const correctionTurnId = randomUUID();
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId: correctionTurnId,
      revision: turnIds.length + 1,
      objectiveId: "D1",
      correctionOfTurnId: turnIds[0],
      answer: { kind: "text", text: "The concern is zero observed use, not failed adoption." },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "That changes the frame, so the downstream answers need to be revisited.",
      answeredCurrentObjective: true,
      candidateUpdates: [],
      nextStep: {
        kind: "question",
        objectiveId: "D3",
        prompt: "Which developers are included in that zero-use observation?",
        support: "We need one coherent cohort before rebuilding the case.",
        inputMode: "text",
        options: [],
      },
    };
    const validated = validateAndApplyProposal(catalog, catalog.packetFor(state, { platformArchetypeIds: [] }), state, envelope, proposal);

    expect(validated.warnings).toEqual([]);
    expect(validated.state.answeredObjectiveIds).toEqual(["D1"]);
    expect(validated.state.nextQuestion?.objectiveId).toBe("D3");
    expect(validated.state.candidates).toEqual([]);
    expect(validated.state.retractedTurnIds).toEqual(turnIds);
    expect(validated.state.acceptedTurnIds).toEqual([...turnIds, correctionTurnId]);
  });

  it("hard-stops at fifteen active prompts without lowering the evidence bar", () => {
    const { catalog } = createTestService();
    const objectiveIds = ["D1", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D1", "D3", "D4", "D5", "D6", "D7"] as const;
    const turnIds = objectiveIds.map(() => randomUUID());
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: 14,
      answeredObjectiveIds: ["D1", "D3", "D4", "D5", "D6", "D7", "D8", "D9"],
      objectiveAttempts: { D1: 2, D3: 2, D4: 2, D5: 2, D6: 2, D7: 2, D8: 1, D9: 1, D10: 2 },
      candidates: [],
      acceptedTurnIds: turnIds,
      turnObjectives: Object.fromEntries(turnIds.map((id, index) => [id, objectiveIds[index]])),
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: null,
      terminalState: null,
    };
    const finalTurnId = randomUUID();
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId: finalTurnId,
      revision: 15,
      objectiveId: "D10",
      answer: { kind: "text", text: "We still do not know what move is justified." },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "One more question may help.",
      answeredCurrentObjective: false,
      candidateUpdates: [],
      nextStep: {
        kind: "question",
        objectiveId: "D10",
        prompt: "What reversible move would produce one useful signal?",
        support: "The move should change what the team knows next.",
        inputMode: "text",
        options: [],
      },
    };

    const validated = validateAndApplyProposal(catalog, catalog.packetFor(state, { platformArchetypeIds: [] }), state, envelope, proposal);
    expect(validated.state.nextQuestion).toBeNull();
    expect(validated.state.terminalState).toBe("needs_evidence");
    expect(validated.warnings).toContain("The fifteen-prompt workshop budget is exhausted");
    expect(validated.reflection).toContain("question limit");
  });

  it("asks permission before going beyond twelve diagnostic prompts", () => {
    const { catalog } = createTestService();
    const objectiveIds = ["D1", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D1", "D3", "D4"] as const;
    const turnIds = objectiveIds.map(() => randomUUID());
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: 11,
      answeredObjectiveIds: ["D1", "D3", "D4", "D5", "D6", "D7", "D8", "D9"],
      objectiveAttempts: { D1: 2, D3: 2, D4: 2, D5: 1, D6: 1, D7: 1, D8: 1, D9: 1 },
      candidates: [],
      acceptedTurnIds: turnIds,
      turnObjectives: Object.fromEntries(turnIds.map((id, index) => [id, objectiveIds[index]])),
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: defaultQuestionFor("D10"),
      terminalState: null,
      extendedPromptBudgetApproved: false,
    };
    const twelfthTurnId = randomUUID();
    const twelfthEnvelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId: twelfthTurnId,
      revision: 12,
      objectiveId: "D10",
      answer: { kind: "text", text: "We need one more step to define the evidence-producing move." },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "A smaller move is still needed.",
      answeredCurrentObjective: false,
      candidateUpdates: [],
      nextStep: { kind: "question", ...defaultQuestionFor("D10") },
    };
    const gated = validateAndApplyProposal(
      catalog,
      catalog.packetFor(state, { platformArchetypeIds: [] }),
      state,
      twelfthEnvelope,
      proposal,
    );
    expect(gated.state.nextQuestion?.options.map((option) => option.id)).toEqual([
      "conversation_finish",
      "conversation_continue_deeper",
    ]);
    expect(gated.state.extendedPromptBudgetApproved).toBe(false);

    const controlTurnId = randomUUID();
    const approved = validateAndApplyProposal(
      catalog,
      catalog.packetFor(gated.state, { platformArchetypeIds: [] }),
      gated.state,
      {
        sessionId: twelfthEnvelope.sessionId,
        turnId: controlTurnId,
        revision: 13,
        objectiveId: "D10",
        answer: { kind: "single_choice", optionIds: ["conversation_continue_deeper"] },
        acceptedAt: new Date().toISOString(),
      },
      {
        reflection: "We can go deeper.",
        answeredCurrentObjective: false,
        candidateUpdates: [],
        nextStep: { kind: "question", ...defaultQuestionFor("D10") },
      },
    );
    expect(approved.state.extendedPromptBudgetApproved).toBe(true);
    expect(approved.state.promptControlTurnIds).toContain(controlTurnId);
    expect(approved.state.nextQuestion).toEqual(defaultQuestionFor("D10"));
  });

  it("labels an unframed hard-cap result as needing evidence", () => {
    const { catalog } = createTestService();
    const turnIds = Array.from({ length: 14 }, () => randomUUID());
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: 14,
      answeredObjectiveIds: [],
      objectiveAttempts: { D1: 14 },
      candidates: [],
      acceptedTurnIds: turnIds,
      turnObjectives: Object.fromEntries(turnIds.map((id) => [id, "D1"])),
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: defaultQuestionFor("D1"),
      terminalState: null,
      extendedPromptBudgetApproved: true,
    };
    const turnId = randomUUID();
    const validated = validateAndApplyProposal(
      catalog,
      catalog.packetFor(state, { platformArchetypeIds: [] }),
      state,
      {
        sessionId: randomUUID(),
        turnId,
        revision: 15,
        objectiveId: "D1",
        answer: { kind: "unknown" },
        acceptedAt: new Date().toISOString(),
      },
      {
        reflection: "Another question might help.",
        answeredCurrentObjective: false,
        candidateUpdates: [],
        nextStep: { kind: "question", ...defaultQuestionFor("D1") },
      },
    );
    expect(validated.state.terminalState).toBe("needs_evidence");
    expect(validated.reflection).toContain("before the case could be framed");
    expect(validated.warnings).toContain("The fifteen-prompt workshop budget is exhausted");
  });

  it("moves on after two unsuccessful follow-ups instead of repeating forever", () => {
    const { catalog } = createTestService();
    const priorTurnIds = [randomUUID(), randomUUID()];
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: catalog.version,
      revision: 2,
      answeredObjectiveIds: [],
      objectiveAttempts: { D1: 2 },
      candidates: [],
      acceptedTurnIds: priorTurnIds,
      turnObjectives: Object.fromEntries(priorTurnIds.map((id) => [id, "D1"])),
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: defaultQuestionFor("D1"),
      terminalState: null,
    };
    const turnId = randomUUID();
    const envelope: TurnEnvelope = {
      sessionId: randomUUID(),
      turnId,
      revision: 3,
      objectiveId: "D1",
      answer: { kind: "text", text: "idk" },
      acceptedAt: new Date().toISOString(),
    };
    const proposal: TurnProposal = {
      reflection: "I still need more detail.",
      answeredCurrentObjective: false,
      candidateUpdates: [],
      nextStep: { kind: "question", objectiveId: "D1", prompt: "What happened?", support: "Use one observed fact if you have it.", inputMode: "text", options: [] },
    };
    const validated = validateAndApplyProposal(catalog, catalog.packetFor(state, { platformArchetypeIds: [] }), state, envelope, proposal);
    expect(validated.state.answeredObjectiveIds).toContain("D1");
    expect(validated.state.nextQuestion?.objectiveId).toBe("D3");
    expect(validated.reflection).toContain("instead of asking the same thing again");
    expect(validated.warnings).toContain("The three-attempt budget for D1 is exhausted");
  });
});
