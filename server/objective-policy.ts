import type { DiagnosticState, NextQuestion, ObjectiveId, TerminalState } from "./domain.js";

export interface ObjectiveDefinition {
  id: ObjectiveId;
  goal: string;
  defaultQuestion: NextQuestion;
}

const definitions: ObjectiveDefinition[] = [
  {
    id: "D1",
    goal: "Capture the concerning behavior without accepting a cause",
    defaultQuestion: { objectiveId: "D1", prompt: "What are developers doing, or not doing, that concerns you?", support: "Start with the behavior you can point to, not the explanation for it.", inputMode: "text", options: [] },
  },
  {
    id: "D3",
    goal: "Identify one developer cohort, actor, and real job",
    defaultQuestion: { objectiveId: "D3", prompt: "Which developers are you talking about, and what are they trying to get done?", support: "A specific cohort and job keeps mixed journeys from looking like one problem.", inputMode: "text", options: [] },
  },
  {
    id: "D4",
    goal: "Define the first meaningful developer result",
    defaultQuestion: { objectiveId: "D4", prompt: "What would the developer be able to see or do when the first mile is complete?", support: "Name an observable result, not only signup, setup, or an internal product event.", inputMode: "text", options: [] },
  },
  {
    id: "D5",
    goal: "Locate the earliest unresolved transition",
    defaultQuestion: { objectiveId: "D5", prompt: "Where does your direct observation of the journey end?", support: "The earliest unknown is usually more useful than the loudest later symptom.", inputMode: "text", options: [] },
  },
  {
    id: "D6",
    goal: "Preserve the last observed truth separately from inference",
    defaultQuestion: { objectiveId: "D6", prompt: "What exactly happened at that point?", support: "Use the event, response, or non-action you observed before explaining why.", inputMode: "text", options: [] },
  },
  {
    id: "D7",
    goal: "Separate the team's explanation from supporting evidence",
    defaultQuestion: { objectiveId: "D7", prompt: "What makes the team think that is the reason?", support: "Assumption, anecdote, logs, observation, and experiment do not support the same conclusion.", inputMode: "text", options: [] },
  },
  {
    id: "D8",
    goal: "Distinguish the smallest live blocker families or identify missing evidence",
    defaultQuestion: { objectiveId: "D8", prompt: "Which observation would best separate the explanations that are still possible?", support: "A useful answer should change which explanation remains live.", inputMode: "text", options: [] },
  },
  {
    id: "D9",
    goal: "Separate control, investigation, influence, and decision authority",
    defaultQuestion: { objectiveId: "D9", prompt: "Who can investigate or change the earliest unresolved step?", support: "A named team is not yet an owner unless the action and authority are clear.", inputMode: "text", options: [] },
  },
  {
    id: "D10",
    goal: "Choose a bounded evidence-producing next move or justified non-intervention",
    defaultQuestion: { objectiveId: "D10", prompt: "What is the smallest next move that would change what you know?", support: "It can be an investigation, a reversible change, a handoff, or no intervention yet.", inputMode: "text", options: [] },
  },
];

export const objectiveDefinitions = new Map(definitions.map((definition) => [definition.id, definition]));
export const diagnosticObjectiveOrder = definitions.map((definition) => definition.id);

export function nextUnansweredObjective(state: DiagnosticState): ObjectiveId | null {
  return diagnosticObjectiveOrder.find((id) => !state.answeredObjectiveIds.includes(id)) ?? null;
}

export function defaultQuestionFor(objectiveId: ObjectiveId): NextQuestion {
  const question = objectiveDefinitions.get(objectiveId)?.defaultQuestion;
  if (!question) throw new Error(`Missing objective definition ${objectiveId}`);
  return question;
}

export function canAskObjective(state: DiagnosticState, currentObjectiveId: ObjectiveId, proposedObjectiveId: ObjectiveId): boolean {
  const firstUnanswered = nextUnansweredObjective(state);
  if (proposedObjectiveId === currentObjectiveId) {
    return (state.objectiveAttempts[currentObjectiveId] ?? 0) < 3;
  }
  return proposedObjectiveId === firstUnanswered;
}

export function safeTerminalFor(state: DiagnosticState): TerminalState {
  const live = state.candidates.filter((candidate) => candidate.evidenceState === "live");
  if (live.length > 1) return "compound_blockers";
  if (live.length === 1) return "hypothesis_ready";
  return "needs_evidence";
}

