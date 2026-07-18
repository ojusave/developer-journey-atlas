import type { CaseAnswers } from "./types";
import { explainSelection } from "./domain/question-routes";
import { getCatalogNode } from "./domain/catalog";
import { getPlatformResearchGroups } from "./domain/knowledge-graph";

export interface ActionBrief {
  title: string;
  observedConcern: string;
  caseBoundary: string;
  platform: string;
  developer: string;
  actor: string;
  developerJob: string;
  firstMeaningfulSuccess: string;
  milestoneCheck: string;
  lastObservedTruth: string;
  currentExplanation: string;
  evidence: string[];
  researchAreas: string[];
  adaptiveResearchAreas: string[];
  adaptiveTerminalState: string;
  platformResearchAreas: string[];
  platformReasonCount: number;
  researchStatus: "unresolved" | "needs_external_evidence" | "deliberate_non_fit" | "catalog_gap" | "compound_blockers" | "legitimate_gate";
  nextObservation: string;
  ownership: string;
  moveType: string;
  nextMove: string;
  expectedSignal: string;
  reviewDate: string;
  reviewNotes: string;
  reviewDecision: string;
  adaptiveClarifications: Record<string, string>;
}

function present(value: string, fallback: string): string {
  return value.trim() || fallback;
}

export function compileActionBrief(answers: CaseAnswers): ActionBrief {
  const result = explainSelection(
    answers.discriminatorQuestionId,
    answers.discriminatorAnswerIds,
  )[0];
  const platformGroups = getPlatformResearchGroups(answers.platformSurfaces);
  const catalogGap = answers.platformSurfaces.includes("Something else");
  const adaptiveResearchAreas = answers.adaptiveCandidates
    .filter((candidate) => candidate.evidenceState === "live" || candidate.evidenceState === "needs_observation")
    .map((candidate) => {
      const label = getCatalogNode(candidate.catalogId)?.label ?? candidate.catalogId;
      return `${label} (${candidate.evidenceState.replaceAll("_", " ")})`;
    });

  return {
    title: "First-Mile Action Brief",
    observedConcern: present(answers.adaptiveClarifications.D1 || answers.concern, "Not clear yet"),
    caseBoundary: present(answers.company, "Not named"),
    platform: present(answers.platform, "Not named"),
    developer: present(answers.developer, "Not clear yet"),
    actor: present(answers.actorType, "Not known"),
    developerJob: present(answers.developerJob, "Not clear yet"),
    firstMeaningfulSuccess: present(answers.outcome, "Not clear yet"),
    milestoneCheck: present(answers.outcomeCheck, "Not classified"),
    lastObservedTruth: present(answers.lastTruth || answers.lastStage, "Not observed yet"),
    currentExplanation: present(answers.explanation, "No explanation supported yet"),
    evidence: answers.evidenceTypes.length > 0 ? answers.evidenceTypes : ["Not classified"],
    researchAreas: result?.liveLabels ?? [],
    adaptiveResearchAreas,
    adaptiveTerminalState: answers.adaptiveTerminalState,
    platformResearchAreas: platformGroups.map((group) => group.label),
    platformReasonCount: platformGroups.reduce((total, group) => total + group.reasons.length, 0),
    researchStatus: catalogGap ? "catalog_gap" : result?.specialState ?? "unresolved",
    nextObservation: catalogGap
      ? "Describe the unrepresented developer surface and review the catalog boundary before choosing a cause."
      : result?.nextObservation ?? "Locate the stopping point before choosing a cause.",
    ownership: present(answers.ownership, "Not clear yet"),
    moveType: present(answers.moveType, "Not chosen"),
    nextMove: present(answers.nextMove, "Not chosen yet"),
    expectedSignal: present(answers.expectedSignal, "Not defined yet"),
    reviewDate: answers.reviewDate,
    reviewNotes: answers.reviewNotes,
    reviewDecision: answers.reviewDecision,
    adaptiveClarifications: answers.adaptiveClarifications,
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([*_`[\]])/g, "\\$1");
}

export function actionBriefToMarkdown(brief: ActionBrief, researchVersion: string): string {
  const areas = brief.researchAreas.length > 0
    ? brief.researchAreas.map((area) => `- ${escapeMarkdown(area)}`).join("\n")
    : "- No catalog explanation is supported yet";

  return [
    `# ${brief.title}`,
    "",
    `Research bundle: ${researchVersion}`,
    "",
    "## Case",
    "",
    `- Boundary: ${escapeMarkdown(brief.caseBoundary)}`,
    `- Platform: ${escapeMarkdown(brief.platform)}`,
    `- Developer: ${escapeMarkdown(brief.developer)}`,
    `- Actor: ${escapeMarkdown(brief.actor)}`,
    `- Developer job: ${escapeMarkdown(brief.developerJob)}`,
    `- Observed concern: ${escapeMarkdown(brief.observedConcern)}`,
    "",
    "## First meaningful success",
    "",
    escapeMarkdown(brief.firstMeaningfulSuccess),
    "",
    `Milestone check: ${escapeMarkdown(brief.milestoneCheck)}`,
    "",
    "## Evidence boundary",
    "",
    `Last observed truth: ${escapeMarkdown(brief.lastObservedTruth)}`,
    "",
    `Current explanation: ${escapeMarkdown(brief.currentExplanation)}`,
    "",
    `Evidence sources: ${brief.evidence.map(escapeMarkdown).join(", ")}`,
    "",
    "## What the research narrows",
    "",
    areas,
    ...(brief.adaptiveResearchAreas.length > 0
      ? [
          "",
          "Adaptive research areas:",
          ...brief.adaptiveResearchAreas.map((area) => `- ${escapeMarkdown(area)}`),
        ]
      : []),
    "",
    `Status: ${brief.researchStatus}. These are live research areas, not an established cause.`,
    ...(brief.adaptiveTerminalState
      ? [`Adaptive stop state: ${escapeMarkdown(brief.adaptiveTerminalState.replaceAll("_", " "))}`]
      : []),
    "",
    `Next distinguishing observation: ${escapeMarkdown(brief.nextObservation)}`,
    "",
    "## Platform-specific research in scope",
    "",
    ...(brief.platformResearchAreas.length > 0
      ? [
          ...brief.platformResearchAreas.map((area) => `- ${escapeMarkdown(area)}`),
          "",
          `${brief.platformReasonCount} platform-specific possibilities remain available for inspection. None is treated as supported without evidence.`,
        ]
      : ["The selected surface is not represented in the current catalog. This is a catalog boundary, not a diagnosis."]),
    "",
    "## Next evidence-producing move",
    "",
    `- Relationship to the move: ${escapeMarkdown(brief.ownership)}`,
    `- Move type: ${escapeMarkdown(brief.moveType)}`,
    `- Move: ${escapeMarkdown(brief.nextMove)}`,
    `- Expected developer signal: ${escapeMarkdown(brief.expectedSignal)}`,
    ...(Object.keys(brief.adaptiveClarifications).length > 0
      ? [
          "",
          "## Clarifications",
          "",
          ...Object.entries(brief.adaptiveClarifications).map(([objectiveId, value]) => `- ${objectiveId}: ${escapeMarkdown(value)}`),
        ]
      : []),
    "",
    "> No intervention justified is a valid result when the evidence cannot separate the live explanations.",
    ...(brief.reviewDate || brief.reviewNotes || brief.reviewDecision
      ? [
          "",
          "## Seven-day check",
          "",
          `- Review date: ${escapeMarkdown(brief.reviewDate || "Not set")}`,
          `- Evidence notes: ${escapeMarkdown(brief.reviewNotes || "None yet")}`,
          `- Decision: ${escapeMarkdown(brief.reviewDecision || "Not decided")}`,
        ]
      : []),
    "",
  ].join("\n");
}
