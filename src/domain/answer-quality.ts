import type { CaseAnswers, ScreenId } from "../types";

const uncertaintyOnly = /^(?:i\s*(?:do not|don't)\s*know|idk|not sure|unknown|no idea|maybe|n\/a|none|unsure)[.!?\s]*$/i;
const genericDeveloper = /^(?:developer|developers|dev|devs|user|users|customer|customers|team|teams|engineer|engineers)$/i;
const platformActionOnly = /^(?:use|using|try|trying|adopt|adopting|implement|implementing|integrate|integrating|install|installing|configure|configuring|call|calling|test|testing|build|building)(?:\s+(?:the|our|a|an))?\s+(?:api|sdk|cli|platform|product|feature|tool|integration|loop|loops|webhook|service)[.!?\s]*$/i;

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function vague(value: string, minimumWords: number): boolean {
  return uncertaintyOnly.test(value.trim()) || wordCount(value) < minimumWords;
}

export function guidedAnswerQualityMessage(screen: ScreenId, answers: CaseAnswers): string | null {
  if (screen === "concern" && vague(answers.concern, 4)) {
    return "Name the behavior you can point to, such as no attempt, a stopped setup, or no continuation. You do not need to know why yet.";
  }
  if (screen === "developer" && (vague(answers.developer, 2) || genericDeveloper.test(answers.developer.trim()))) {
    return "Narrow this to one developer cohort, such as backend engineers evaluating an event integration.";
  }
  if (screen === "developer-job" && (vague(answers.developerJob, 3) || platformActionOnly.test(answers.developerJob.trim()))) {
    return "Describe what developers need to accomplish beyond using the product. Try: They need to ___ so that ___.";
  }
  if (screen === "outcome" && (
    vague(answers.outcome, 4)
    || answers.outcomeCheck === "A product event, such as signup, key creation, or first request"
  )) {
    return "Name what the developer can verify after the product event, such as a received event, query result, deployed change, or visible receipt.";
  }
  if (screen === "last-truth" && answers.lastStage !== "We cannot locate the stop yet" && vague(answers.lastTruth, 3)) {
    return "Describe the last event or non-event you directly observed, before explaining why it happened.";
  }
  if (screen === "ownership" && vague(answers.ownership, 4)) {
    return "Name the investigation, change, or decision and who has authority to perform it, not only a team name.";
  }
  if (screen === "next-move" && vague(answers.nextMove, 3)) {
    return "Name one small investigation, reversible change, handoff, or explicit non-intervention.";
  }
  if (
    screen === "next-move"
    && answers.moveType !== "No intervention is justified yet"
    && vague(answers.expectedSignal, 3)
  ) {
    return "Name the developer signal that would be different if this move teaches you something.";
  }
  return null;
}
