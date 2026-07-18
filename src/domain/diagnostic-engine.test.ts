import { describe, expect, it } from "vitest";
import { emptyAnswers, type CaseAnswers } from "../types";
import {
  acceptAnswer,
  appendCaseSignal,
  caseAnswersToDiagnosticCase,
  correctAnswer,
  createDiagnosticCase,
  deriveDiagnosticState,
  evaluateStopCondition,
  getActiveAnswerEvents,
  selectNextQuestionTarget,
} from "./diagnostic-engine";

const completeAnswers: CaseAnswers = {
  ...emptyAnswers,
  name: "Sam",
  company: "Example team",
  platform: "Example API",
  platformSurfaces: ["API or SDK"],
  role: "Developer relations",
  concern: "Intended developers are not starting an integration.",
  concernPattern: "We see no attempt",
  developer: "Application developers evaluating an integration",
  actorType: "A person",
  developerJob: "Receive a business event in an existing service",
  outcome: "A representative event arrives and can be verified",
  outcomeCheck: "A result the developer can verify",
  lastStage: "No attempt observed",
  lastTruth: "No attempt appears in the available journey data.",
  explanation: "The work may not be urgent enough to start.",
  evidenceTypes: ["Direct observation"],
  evidenceDetail: "One representative developer deferred the attempt.",
  discriminatorQuestionId: "DQ_NO_ATTEMPT",
  discriminatorAnswerIds: ["planned_delayed"],
  ownershipMode: "I can investigate it directly",
  ownership: "I can observe one evaluation without rescuing it.",
  moveType: "Gather better evidence",
  nextMove: "Observe one intended developer choosing whether to start.",
  expectedSignal: "The earliest unresolved transition becomes visible.",
};

describe("deterministic diagnostic engine", () => {
  it("starts with deterministic intake and explicit unanswered objectives", () => {
    const caseFile = createDiagnosticCase("case-1");
    const state = deriveDiagnosticState(caseFile);
    expect(selectNextQuestionTarget(caseFile).questionId).toBe("profile-name");
    expect(state.objectives.D1.status).toBe("unanswered");
    expect(state.objectives.D10.status).toBe("unanswered");
  });

  it("derives all ten objective states from the current active answers", () => {
    const state = deriveDiagnosticState(caseAnswersToDiagnosticCase(completeAnswers, "case-2"));
    expect(Object.values(state.objectives).every((objective) => objective.status === "satisfied")).toBe(true);
    expect(state.candidateUniverse.reasonIds).toContain("P04.11");
    expect(state.candidateFamilies.find((family) => family.familyId === "U01")?.evidenceState).toBe("live");
    expect(state.candidateReasons.find((reason) => reason.reasonId === "U01.02")?.evidenceState).toBe("live");
    expect(state.candidateReasons.find((reason) => reason.reasonId === "U01.02")?.canBeReportedAsCause).toBe(false);
  });

  it("keeps corrections append-only and retracts the previous candidate effect", () => {
    let caseFile = createDiagnosticCase("case-3");
    caseFile = acceptAnswer(caseFile, {
      eventId: "stage-1",
      questionId: "last-truth",
      answer: { lastStage: "No attempt observed", lastTruth: "No attempt is visible." },
    });
    caseFile = acceptAnswer(caseFile, {
      eventId: "disc-1",
      questionId: "catalog-discriminator",
      answer: { discriminatorQuestionId: "DQ_NO_ATTEMPT", discriminatorAnswerIds: ["none"] },
    });
    expect(deriveDiagnosticState(caseFile).candidateReasons.find((reason) => reason.reasonId === "U27.01")?.evidenceState).toBe("live");

    caseFile = correctAnswer(caseFile, {
      eventId: "disc-2",
      correctsEventId: "disc-1",
      questionId: "catalog-discriminator",
      answer: { discriminatorQuestionId: "DQ_NO_ATTEMPT", discriminatorAnswerIds: ["planned_delayed"] },
    });
    const state = deriveDiagnosticState(caseFile);
    expect(caseFile.events).toHaveLength(3);
    expect(getActiveAnswerEvents(caseFile).map((event) => event.eventId)).toEqual(["stage-1", "disc-2"]);
    expect(state.candidateReasons.find((reason) => reason.reasonId === "U27.01")?.evidenceState).not.toBe("live");
    expect(state.candidateReasons.find((reason) => reason.reasonId === "U01.02")?.evidenceState).toBe("live");
  });

  it("invalidates a discriminator when an upstream correction changes the route", () => {
    let caseFile = caseAnswersToDiagnosticCase(completeAnswers, "case-4");
    caseFile = correctAnswer(caseFile, {
      eventId: "stage-correction",
      correctsEventId: "snapshot-9",
      questionId: "last-truth",
      answer: { lastStage: "They produced a first result", lastTruth: "The first result was visible." },
    });
    const state = deriveDiagnosticState(caseFile);
    const target = selectNextQuestionTarget(caseFile);
    expect(state.questionProgress["catalog-discriminator"].status).toBe("stale");
    expect(state.candidateFamilies.find((family) => family.familyId === "U01")).toBeUndefined();
    expect(state.candidateReasons.find((reason) => reason.reasonId === "U01.02")).toBeUndefined();
    expect(state.candidateFamilies.find((family) => family.familyId === "U26")?.evidenceState).toBe("weakened");
    expect(target.kind).toBe("clarifier");
    expect(target.questionId).toBe("catalog-discriminator");
    expect(target.discriminatorQuestionId).toBe("DQ_VERIFY");
  });

  it("rejects silent overwrites and corrections to inactive answers", () => {
    let caseFile = createDiagnosticCase("case-5");
    caseFile = acceptAnswer(caseFile, { eventId: "name-1", questionId: "profile-name", answer: { name: "Sam" } });
    expect(() => acceptAnswer(caseFile, { eventId: "name-2", questionId: "profile-name", answer: { name: "Lee" } })).toThrow(/correction instead/);
    caseFile = correctAnswer(caseFile, { eventId: "name-2", correctsEventId: "name-1", questionId: "profile-name", answer: { name: "Lee" } });
    expect(() => correctAnswer(caseFile, { eventId: "name-3", correctsEventId: "name-1", questionId: "profile-name", answer: { name: "Jo" } })).toThrow(/not an active answer/);
  });

  it("offers a recovery path after repeated partial corrections", () => {
    let caseFile = createDiagnosticCase("case-6");
    caseFile = acceptAnswer(caseFile, { eventId: "name-1", questionId: "profile-name", answer: { name: "" } });
    caseFile = correctAnswer(caseFile, { eventId: "name-2", correctsEventId: "name-1", questionId: "profile-name", answer: { name: "" } });
    caseFile = correctAnswer(caseFile, { eventId: "name-3", correctsEventId: "name-2", questionId: "profile-name", answer: { name: "" } });
    const target = selectNextQuestionTarget(caseFile);
    expect(target.kind).toBe("recovery");
    expect(target.canFinishWithCurrentEvidence).toBe(true);
  });

  it("stops at an evidence-producing action without pretending a cause is known", () => {
    const caseFile = caseAnswersToDiagnosticCase(completeAnswers, "case-7");
    const state = deriveDiagnosticState(caseFile);
    const stop = evaluateStopCondition(caseFile, state);
    expect(stop.terminalState).toBe("action_ready");
    expect(stop.shouldAskAnotherQuestion).toBe(false);
    expect(state.candidateReasons.filter((reason) => reason.canBeReportedAsCause)).toHaveLength(0);
  });

  it("uses the deterministic actor answer to activate the agent research overlay", () => {
    const state = deriveDiagnosticState(caseAnswersToDiagnosticCase({
      ...completeAnswers,
      actorType: "An AI or coding agent",
    }, "case-agent"));
    expect(state.candidateFamilies.find((family) => family.familyId === "U26")?.evidenceState).toBe("live");
    expect(state.candidateReasons.some((reason) => reason.parentId === "U26" && reason.evidenceState === "needs_observation")).toBe(true);
  });

  it("returns an explicit catalog gap for an unrepresented platform surface", () => {
    const caseFile = caseAnswersToDiagnosticCase({
      ...completeAnswers,
      platformSurfaces: ["Something else"],
      platformSurfaceOther: "A proprietary simulation environment",
    }, "case-gap");
    expect(deriveDiagnosticState(caseFile).selectedSpecialState).toBe("catalog_gap");
    expect(evaluateStopCondition(caseFile).terminalState).toBe("catalog_gap");
  });

  it("keeps compound barriers separate instead of turning them into one cause", () => {
    const caseFile = caseAnswersToDiagnosticCase({
      ...completeAnswers,
      lastStage: "They started setup or implementation",
      lastTruth: "The install failed, then the recovery instructions led to a separate permission error.",
      discriminatorQuestionId: "DQ_IMPLEMENTATION",
      discriminatorAnswerIds: ["compound"],
    }, "case-compound");
    const stop = evaluateStopCondition(caseFile);
    expect(stop.terminalState).toBe("compound_blockers");
    expect(stop.reason).toContain("more than one barrier");
  });

  it("treats an unknown discriminator answer as an evidence stop", () => {
    const answers = {
      ...completeAnswers,
      discriminatorAnswerIds: ["unknown"],
      moveType: "",
      nextMove: "",
      expectedSignal: "",
    };
    const caseFile = caseAnswersToDiagnosticCase(answers, "case-8");
    expect(evaluateStopCondition(caseFile).terminalState).toBe("needs_evidence");
    expect(selectNextQuestionTarget(caseFile).questionId).toBe("next-move");
  });

  it("requires evidence for system-level catalog, gate, and compound signals", () => {
    const caseFile = acceptAnswer(createDiagnosticCase("case-9"), {
      eventId: "evidence-1",
      questionId: "concern",
      answer: { concern: "Developers stop.", concernPattern: "They start, then stop" },
    });
    expect(() => appendCaseSignal(caseFile, { eventId: "gap-1", signal: "catalog_gap" })).toThrow(/requires at least one/);
    const signaled = appendCaseSignal(caseFile, { eventId: "gap-1", signal: "catalog_gap", evidenceEventIds: ["evidence-1"], note: "The observed surface has no reviewed route." });
    expect(evaluateStopCondition(signaled).terminalState).toBe("catalog_gap");
  });

  it("retracts a derived case signal when its evidence is corrected", () => {
    let caseFile = acceptAnswer(createDiagnosticCase("case-10"), {
      eventId: "evidence-1",
      questionId: "concern",
      answer: { concern: "Developers stop.", concernPattern: "They start, then stop" },
    });
    caseFile = appendCaseSignal(caseFile, { eventId: "gap-1", signal: "catalog_gap", evidenceEventIds: ["evidence-1"] });
    caseFile = correctAnswer(caseFile, {
      eventId: "evidence-2",
      correctsEventId: "evidence-1",
      questionId: "concern",
      answer: { concern: "Developers stop after setup.", concernPattern: "They start, then stop" },
    });
    expect(deriveDiagnosticState(caseFile).signals).toEqual([]);
    expect(evaluateStopCondition(caseFile).terminalState).not.toBe("catalog_gap");
  });
});
