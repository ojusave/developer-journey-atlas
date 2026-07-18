import type { DiagnosticCatalog, CatalogPacket } from "./catalog.js";
import type {
  CandidateState,
  DiagnosticState,
  NextQuestion,
  ObjectiveId,
  TerminalState,
  TurnEnvelope,
} from "./domain.js";
import { defaultQuestionFor, diagnosticObjectiveOrder, nextUnansweredObjective } from "./objective-policy.js";
import type { TurnProposal } from "./reasoner.js";

export interface ValidatedTurn {
  state: DiagnosticState;
  reflection: string;
  warnings: string[];
}

const minimumEvidenceObjectives: ObjectiveId[] = ["D1", "D3", "D4", "D5", "D6"];
const hardPromptBudget = 15;
const earlyTerminalStates = new Set<TerminalState>(["user_declines", "safety_boundary"]);
const unsupportedCausalReflection = /\b(?:is|are|was|were)\s+(?:the|a|your)\s+(?:blocker|cause|reason)\b|\b(?:the|root)\s+cause\s+is\b|\bcaused\s+by\b|\bproves?\s+(?:the|a)\s+(?:blocker|cause)\b/i;

function validateQuestion(question: NextQuestion): string[] {
  const errors: string[] = [];
  if (question.inputMode === "text" && question.options.length > 0) {
    errors.push("Text questions cannot include options");
  }
  if (question.inputMode !== "text" && question.options.length < 2) {
    errors.push("Choice questions must include at least two options");
  }
  if (new Set(question.options.map((option) => option.id)).size !== question.options.length) {
    errors.push("Question option IDs must be unique");
  }
  return errors;
}

function retractTurn(state: DiagnosticState, turnId: string, objectiveId: ObjectiveId): DiagnosticState {
  const correctedIndex = diagnosticObjectiveOrder.indexOf(objectiveId);
  const invalidatedTurnIds = Object.entries(state.turnObjectives)
    .filter(([candidateTurnId, candidateObjectiveId]) => (
      candidateTurnId === turnId || diagnosticObjectiveOrder.indexOf(candidateObjectiveId) > correctedIndex
    ))
    .map(([candidateTurnId]) => candidateTurnId);
  const invalidated = new Set(invalidatedTurnIds);
  const candidates = state.candidates
    .map((candidate) => ({
      ...candidate,
      evidenceTurnIds: candidate.evidenceTurnIds.filter((id) => !invalidated.has(id)),
    }))
    .filter((candidate) => candidate.evidenceTurnIds.length > 0);
  const answeredObjectiveIds = state.answeredObjectiveIds.filter(
    (candidateObjectiveId) => diagnosticObjectiveOrder.indexOf(candidateObjectiveId) < correctedIndex,
  );
  const objectiveAttempts = Object.fromEntries(
    Object.entries(state.objectiveAttempts).filter(([candidateObjectiveId]) => (
      diagnosticObjectiveOrder.indexOf(candidateObjectiveId as ObjectiveId) < correctedIndex
    )),
  );
  return {
    ...state,
    answeredObjectiveIds,
    objectiveAttempts,
    candidates,
    extendedPromptBudgetApproved: false,
    retractedTurnIds: [...new Set([...state.retractedTurnIds, ...invalidatedTurnIds])],
  };
}

function mergeCandidates(existing: CandidateState[], updates: CandidateState[]): CandidateState[] {
  const byId = new Map(existing.map((candidate) => [candidate.catalogId, candidate]));
  for (const update of updates) {
    byId.set(update.catalogId, {
      catalogId: update.catalogId,
      evidenceState: update.evidenceState,
      evidenceTurnIds: [...new Set(update.evidenceTurnIds)],
    });
  }
  return [...byId.values()].sort((left, right) => left.catalogId.localeCompare(right.catalogId));
}

function validateTerminal(terminalState: TerminalState, state: DiagnosticState): string[] {
  const errors: string[] = [];
  const answered = new Set(state.answeredObjectiveIds);
  if (earlyTerminalStates.has(terminalState)) {
    return errors;
  }
  if (!answered.has("D10")) errors.push(`${terminalState} requires the evidence-producing next-move objective`);
  if (!answered.has("D8")) errors.push(`${terminalState} requires the discriminator objective`);
  if (!answered.has("D9")) errors.push(`${terminalState} requires ownership evidence`);
  return errors;
}

export function validateAndApplyProposal(
  catalog: DiagnosticCatalog,
  catalogPacket: CatalogPacket,
  priorState: DiagnosticState,
  envelope: TurnEnvelope,
  proposal: TurnProposal,
  options: { trustReflection?: boolean } = {},
): ValidatedTurn {
  const errors: string[] = [];
  const participantReflection = options.trustReflection
    ? proposal.reflection
    : proposal.answeredCurrentObjective
      ? proposal.candidateUpdates.length > 0
        ? "That answer changes which research areas are worth investigating. It does not establish a cause by itself."
        : "That gives us a clearer boundary to carry forward without turning it into a cause."
      : "That does not resolve this part of the case yet. I will ask one smaller question instead of guessing.";
  const allowedCatalogIds = new Set(catalogPacket.allowedCatalogIds);
  const allowedEvidenceTurnIds = new Set([
    ...priorState.acceptedTurnIds.filter((id) => !priorState.retractedTurnIds.includes(id)),
    envelope.turnId,
  ]);

  if (unsupportedCausalReflection.test(proposal.reflection)) {
    errors.push("Reflection makes an unsupported causal claim");
  }

  if (envelope.correctionOfTurnId) {
    if (!priorState.acceptedTurnIds.includes(envelope.correctionOfTurnId)) {
      errors.push("A correction must reference an accepted turn in this session");
    }
    if (priorState.retractedTurnIds.includes(envelope.correctionOfTurnId)) {
      errors.push("The referenced turn is already retracted");
    }
    allowedEvidenceTurnIds.delete(envelope.correctionOfTurnId);
  }

  for (const update of proposal.candidateUpdates) {
    if (!allowedCatalogIds.has(update.catalogId)) errors.push(`Catalog ID ${update.catalogId} was not supplied to the reasoner`);
    const node = catalog.get(update.catalogId);
    if (!node) {
      errors.push(`Catalog ID ${update.catalogId} does not exist`);
      continue;
    }
    if (node.kind !== "universal_family" && node.kind !== "reason") {
      errors.push(`Catalog ID ${update.catalogId} is not a blocker family or reason`);
    }
    if (node.kind === "reason" && node.diagnosticEligibility !== "diagnosis_eligible" && update.evidenceState === "live") {
      errors.push(`Reason ${update.catalogId} is not diagnosis eligible and cannot be marked live`);
    }
    for (const turnId of update.evidenceTurnIds) {
      if (!allowedEvidenceTurnIds.has(turnId)) errors.push(`Candidate ${update.catalogId} cites unavailable evidence`);
    }
  }

  let state = envelope.correctionOfTurnId
    ? retractTurn(priorState, envelope.correctionOfTurnId, envelope.objectiveId)
    : priorState;
  const choiceIds = envelope.answer.kind === "single_choice" || envelope.answer.kind === "multi_choice"
    ? envelope.answer.optionIds ?? []
    : [];
  const approvedExtendedBudgetThisTurn = choiceIds.includes("conversation_continue_deeper");
  const attempts = (state.objectiveAttempts[envelope.objectiveId] ?? 0) + (approvedExtendedBudgetThisTurn ? 0 : 1);
  const answeredObjectiveIds = proposal.answeredCurrentObjective
    ? [...new Set([...state.answeredObjectiveIds, envelope.objectiveId])]
    : state.answeredObjectiveIds;
  state = {
    ...state,
    revision: envelope.revision,
    answeredObjectiveIds,
    objectiveAttempts: { ...state.objectiveAttempts, [envelope.objectiveId]: attempts },
    acceptedTurnIds: [...state.acceptedTurnIds, envelope.turnId],
    promptControlTurnIds: approvedExtendedBudgetThisTurn
      ? [...(state.promptControlTurnIds ?? []), envelope.turnId]
      : state.promptControlTurnIds,
    turnObjectives: { ...state.turnObjectives, [envelope.turnId]: envelope.objectiveId },
    lastReflection: participantReflection,
    extendedPromptBudgetApproved: state.extendedPromptBudgetApproved || approvedExtendedBudgetThisTurn,
  };

  const activePromptCount = state.acceptedTurnIds.filter(
    (turnId) => !state.retractedTurnIds.includes(turnId) && !(state.promptControlTurnIds ?? []).includes(turnId),
  ).length;
  if (activePromptCount >= hardPromptBudget && proposal.nextStep.kind === "question") {
    const framed = minimumEvidenceObjectives.every((id) => state.answeredObjectiveIds.includes(id));
    const reflection = framed
      ? "We have reached the question limit. The useful next step is to gather the smallest observation that can separate the live explanations."
      : "We have reached the question limit before the case could be framed. I will preserve the unanswered objective instead of repeating questions or forcing a diagnosis.";
    return {
      state: {
        ...state,
        lastReflection: reflection,
        candidates: errors.length > 0 ? state.candidates : mergeCandidates(state.candidates, proposal.candidateUpdates),
        nextQuestion: null,
        terminalState: "needs_evidence",
      },
      reflection,
      warnings: [...errors, "The fifteen-prompt workshop budget is exhausted"],
    };
  }

  if (approvedExtendedBudgetThisTurn && proposal.nextStep.kind === "question") {
    const reflection = "All right. I can ask up to three more questions, and we will still stop without a diagnosis if the evidence does not separate the possibilities.";
    return {
      state: {
        ...state,
        lastReflection: reflection,
        nextQuestion: defaultQuestionFor(proposal.nextStep.objectiveId),
        terminalState: null,
      },
      reflection,
      warnings: errors,
    };
  }

  if (
    activePromptCount >= 12
    && !state.extendedPromptBudgetApproved
    && proposal.nextStep.kind === "question"
  ) {
    const reflection = "We have enough to pause here. If you want, I can ask up to three more questions before the workshop limit.";
    return {
      state: {
        ...state,
        lastReflection: reflection,
        candidates: errors.length > 0 ? state.candidates : mergeCandidates(state.candidates, proposal.candidateUpdates),
        nextQuestion: {
          objectiveId: proposal.nextStep.objectiveId,
          prompt: "Would you like to finish now or go a little deeper?",
          support: "The next questions may sharpen the evidence plan, but they will not force a diagnosis.",
          inputMode: "single_choice",
          options: [
            { id: "conversation_finish", label: "Finish with what we have" },
            { id: "conversation_continue_deeper", label: "Ask up to three more questions" },
          ],
        },
        terminalState: null,
      },
      reflection,
      warnings: errors,
    };
  }

  if (
    proposal.nextStep.kind === "question"
    && proposal.nextStep.objectiveId === envelope.objectiveId
    && attempts >= 3
  ) {
    const boundedState = {
      ...state,
      answeredObjectiveIds: [...new Set([...state.answeredObjectiveIds, envelope.objectiveId])],
    };
    const nextObjective = nextUnansweredObjective(boundedState);
    const reflection = "This objective is still unresolved after two follow-ups. I will carry the gap forward instead of asking the same thing again.";
    return {
      state: {
        ...boundedState,
        lastReflection: reflection,
        candidates: errors.length > 0 ? state.candidates : mergeCandidates(state.candidates, proposal.candidateUpdates),
        nextQuestion: nextObjective ? defaultQuestionFor(nextObjective) : null,
        terminalState: nextObjective ? null : "needs_evidence",
      },
      reflection,
      warnings: [...errors, `The three-attempt budget for ${envelope.objectiveId} is exhausted`],
    };
  }

  if (proposal.nextStep.kind === "question") {
    errors.push(...validateQuestion(proposal.nextStep));
    if (!proposal.answeredCurrentObjective && proposal.nextStep.objectiveId !== envelope.objectiveId) {
      errors.push("An incomplete objective can only ask a subquestion for the same objective");
    }
    if (proposal.answeredCurrentObjective) {
      const expected = nextUnansweredObjective(state);
      if (proposal.nextStep.objectiveId !== expected) {
        errors.push(`The next question must address the earliest unresolved objective ${expected ?? "none"}`);
      }
    }
  } else {
    errors.push(...validateTerminal(proposal.nextStep.terminalState, state));
  }

  if (errors.length > 0) {
    const nextObjective = nextUnansweredObjective(state);
    const nextQuestion = nextObjective ? defaultQuestionFor(nextObjective) : null;
    const reflection = "I captured the answer, but the proposed conclusion was not supported by this case. We will stay with what the evidence can establish.";
    return {
      state: {
        ...state,
        lastReflection: reflection,
        nextQuestion,
        terminalState: nextQuestion ? null : "needs_evidence",
      },
      reflection,
      warnings: errors,
    };
  }

  return {
    state: {
      ...state,
      candidates: mergeCandidates(state.candidates, proposal.candidateUpdates),
      nextQuestion: proposal.nextStep.kind === "question"
        ? {
            objectiveId: proposal.nextStep.objectiveId,
            prompt: proposal.nextStep.prompt,
            support: proposal.nextStep.support,
            inputMode: proposal.nextStep.inputMode,
            options: proposal.nextStep.options,
          }
        : null,
      terminalState: proposal.nextStep.kind === "stop" ? proposal.nextStep.terminalState : null,
    },
    reflection: participantReflection,
    warnings: [],
  };
}
