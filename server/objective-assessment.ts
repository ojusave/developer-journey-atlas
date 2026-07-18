import type { DiagnosticAnswer, NextQuestion, ObjectiveId } from "./domain.js";

export interface ObjectiveAssessment {
  answered: boolean;
  reflection: string;
  followUp: NextQuestion | null;
}

const uncertaintyOnly = /^(?:i\s*(?:do not|don't)\s*know|idk|not sure|unknown|no idea|maybe|n\/a|none|unsure)[.!?\s]*$/i;
const genericDeveloper = /^(?:developer|developers|dev|devs|user|users|customer|customers|team|teams|engineer|engineers)$/i;
const platformActionOnly = /^(?:use|using|try|trying|adopt|adopting|implement|implementing|integrate|integrating|install|installing|configure|configuring|call|calling|test|testing|build|building)(?:\s+(?:the|our|a|an))?\s+(?:api|sdk|cli|platform|product|feature|tool|integration|loop|loops|webhook|service)[.!?\s]*$/i;
const productEventOnly = /^(?:sign\s*up|signup|create(?:d)?\s+(?:an?\s+)?(?:account|key|token|project)|install(?:ed)?|configure(?:d)?|make|made|send|sent|receive|received)?\s*(?:an?\s+)?(?:first\s+)?(?:api\s+call|request|product\s+event)[.!?\s]*$/i;
const boredomOrIrritation = /\b(?:this\s+is\s+(?:really\s+)?boring|i(?:'m|\s+am)\s+bored|too\s+many\s+questions|this\s+is\s+taking\s+too\s+long|can\s+we\s+(?:stop|finish|speed\s+this\s+up)|just\s+finish)\b/i;

function textOf(answer: DiagnosticAnswer): string {
  return answer.kind === "text" ? answer.text?.trim() ?? "" : "";
}

export function isBoredomOrIrritation(answer: DiagnosticAnswer): boolean {
  return answer.kind === "text" && boredomOrIrritation.test(answer.text ?? "");
}

function meaningful(value: string, minimumWords = 3): boolean {
  const trimmed = value.trim();
  if (!trimmed || uncertaintyOnly.test(trimmed)) return false;
  return trimmed.split(/\s+/).filter(Boolean).length >= minimumWords;
}

function lineValue(text: string, label: string): string {
  const line = text.split("\n").find((candidate) => candidate.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  return line?.slice(line.indexOf(":") + 1).trim() ?? "";
}

function textQuestion(objectiveId: ObjectiveId, prompt: string, support: string): NextQuestion {
  return { objectiveId, prompt, support, inputMode: "text", options: [] };
}

function choiceQuestion(objectiveId: ObjectiveId, prompt: string, support: string, options: Array<{ id: string; label: string }>): NextQuestion {
  return { objectiveId, prompt, support, inputMode: "single_choice", options };
}

function unresolved(objectiveId: ObjectiveId, attempt: number, first: NextQuestion, second?: NextQuestion): ObjectiveAssessment {
  return {
    answered: false,
    reflection: "That does not give us enough to move the case forward yet. A smaller question may be easier to answer.",
    followUp: attempt > 0 && second ? second : first,
  };
}

export function assessObjectiveAnswer(objectiveId: ObjectiveId, answer: DiagnosticAnswer, priorAttempts: number): ObjectiveAssessment {
  if (answer.kind === "unknown") {
    if (objectiveId === "D6" || objectiveId === "D8") {
      return {
        answered: true,
        reflection: "Not knowing is useful here. I will carry this as an evidence gap instead of turning it into a cause.",
        followUp: null,
      };
    }
    return unresolved(
      objectiveId,
      priorAttempts,
      textQuestion(objectiveId, "What is the smallest concrete thing you can point to?", "A single observed action, result, or missing result is enough."),
      choiceQuestion(objectiveId, "Which answer is closest?", "Choose the boundary you can defend. You can keep the rest unknown.", [
        { id: "observed", label: "I can name one observed event or non-event" },
        { id: "reported", label: "I only have something a developer or teammate reported" },
        { id: "aggregate", label: "I only have aggregate product data" },
        { id: "still_unknown", label: "We genuinely do not know yet" },
      ]),
    );
  }

  if (answer.kind === "single_choice" || answer.kind === "multi_choice") {
    const optionIds = answer.optionIds ?? [];
    const unknownChoice = optionIds.every((id) => /unknown|cannot_tell|still_unknown|none/i.test(id));
    return {
      answered: true,
      reflection: unknownChoice
        ? "That keeps the case unresolved, which is more honest than choosing a cause. We will make the missing observation explicit."
        : "That answer changes which explanations remain worth investigating. It does not establish a cause by itself.",
      followUp: null,
    };
  }

  const text = textOf(answer);
  if (objectiveId === "D1") {
    const concern = text.split(/\nObserved pattern:/i)[0]?.trim() ?? text;
    if (!meaningful(concern, 4)) {
      return unresolved(
        objectiveId,
        priorAttempts,
        textQuestion("D1", "What are developers doing, or not doing, that you can point to?", "Describe the behavior before explaining why it happens."),
        choiceQuestion("D1", "Which pattern is closest to what you can observe?", "This locates the case without asking you to know the reason yet.", [
          { id: "no_attempt", label: "We see no attempt" },
          { id: "started_stopped", label: "They start, then stop" },
          { id: "result_no_continue", label: "They get a result, but do not continue" },
          { id: "measurement_gap", label: "Our data does not tell us" },
        ]),
      );
    }
  }

  if (objectiveId === "D3") {
    const developer = lineValue(text, "Developer");
    const job = lineValue(text, "Job");
    if (!meaningful(developer, 2) || genericDeveloper.test(developer) || !meaningful(job, 3) || platformActionOnly.test(job)) {
      return unresolved(
        objectiveId,
        priorAttempts,
        textQuestion("D3", "Which developers, and what are they trying to accomplish beyond using this product?", "Name one coherent cohort and the result they need in their own system or workflow."),
        textQuestion("D3", "Complete this sentence: These developers need to ___ so that ___.", "Avoid product verbs such as install, integrate, or call the API unless you also name the result they need."),
      );
    }
  }

  if (objectiveId === "D4") {
    const result = text.split(/\nMilestone check:/i)[0]?.trim() ?? text;
    const milestone = lineValue(text, "Milestone check");
    if (!meaningful(result, 4) || productEventOnly.test(result) || /product event/i.test(milestone)) {
      return unresolved(
        objectiveId,
        priorAttempts,
        textQuestion("D4", "What can the developer verify after that product event happens?", "Name the first result that proves progress on the developer's job, not only progress inside the platform."),
        textQuestion("D4", "What would the developer show a teammate to prove the first mile worked?", "Use a visible receipt, response, deployed change, received event, query result, or other checkable outcome."),
      );
    }
  }

  if (objectiveId === "D5" && !meaningful(text, 2)) {
    return unresolved(
      objectiveId,
      priorAttempts,
      textQuestion("D5", "Where does direct observation of this journey end?", "Choose the earliest transition where you no longer know what happened."),
    );
  }

  if (objectiveId === "D6" && !meaningful(text, 3)) {
    return {
      answered: true,
      reflection: "The last observed event is still unclear. I will preserve that measurement gap rather than filling it with an explanation.",
      followUp: null,
    };
  }

  if (objectiveId === "D7") {
    const explanation = lineValue(text, "Current explanation");
    const evidenceTypes = lineValue(text, "Evidence types");
    if (!meaningful(explanation, 3) || !evidenceTypes) {
      return unresolved(
        objectiveId,
        priorAttempts,
        textQuestion("D7", "What is the team's explanation, and what evidence actually supports it?", "Keep the explanation separate from observation, product data, interviews, anecdotes, or assumptions."),
      );
    }
  }

  if (objectiveId === "D9" && !meaningful(text, 5)) {
    return unresolved(
      objectiveId,
      priorAttempts,
      textQuestion("D9", "Who can perform the next investigation or change, and what can they do?", "Name the action and authority, not only a team name."),
    );
  }

  if (objectiveId === "D10") {
    const moveType = text.split("\n")[0]?.trim() ?? "";
    const move = lineValue(text, "Move");
    const expectedSignal = lineValue(text, "Expected signal");
    const nonIntervention = /no intervention/i.test(moveType);
    if (!meaningful(move, 3) || (!nonIntervention && (!meaningful(expectedSignal, 3) || /not defined/i.test(expectedSignal)))) {
      return unresolved(
        objectiveId,
        priorAttempts,
        textQuestion("D10", "What small move will change what the team knows, and what signal will you look for?", "Use an investigation, reversible change, named handoff, or explicit non-intervention."),
        textQuestion("D10", "Within seven days, what will someone do and what evidence will be different?", "Keep the move small enough to run and the expected signal specific enough to compare."),
      );
    }
  }

  if (!meaningful(text, 2)) {
    return unresolved(
      objectiveId,
      priorAttempts,
      textQuestion(objectiveId, "Can you add one concrete detail?", "A short observed fact is enough. You do not need to explain the cause."),
    );
  }

  return {
    answered: true,
    reflection: "That is specific enough to carry forward. I will keep the observation separate from any explanation it might suggest.",
    followUp: null,
  };
}
