import type { PhaseId } from "./types";

export const phaseLabels: Array<{ id: PhaseId; label: string }> = [
  { id: "profile", label: "Set the scene" },
  { id: "frame", label: "Define success" },
  { id: "map", label: "Map the path" },
  { id: "locate", label: "Mark the break" },
  { id: "test", label: "Name the issue" },
];

export const roleChoices = [
  "Developer relations",
  "Product",
  "Engineering",
  "Documentation",
  "Developer support",
  "Solutions or field team",
  "Community",
  "Something else",
];

export const platformSurfaceChoices = [
  "API or SDK",
  "Cloud, deployment, infrastructure, or data",
  "Framework, library, runtime, or developer tool",
  "AI or agent platform",
  "Integration, plugin, extension, or marketplace",
  "Open-source project",
  "Internal developer platform",
  "Mobile, browser, hardware, edge, or IoT",
  "Web3, blockchain, wallet, or decentralized protocol",
  "Workflow or visual builder",
  "Something else",
];

export const concernPatternChoices = [
  "We see no attempt",
  "They start, then stop",
  "They get a result, but do not continue",
  "They succeed only with help",
  "Our data does not tell us",
  "Something else",
];

export const actorTypeChoices = [
  "A person",
  "An AI or coding agent",
  "A person and agent handing work back and forth",
  "We do not know",
];

export const journeyTypeChoices = [
  "Evaluate whether it fits",
  "Learn enough to use it safely",
  "Make the core capability work once",
  "Connect it to an existing system",
  "Ship it in a production-like environment",
  "Operate and recover it",
  "Contribute a change",
  "Publish an integration or extension",
];

export const breakEvidenceChoices = [
  "I observed a real attempt",
  "Product or platform data shows it",
  "Developers told us in interviews or support",
  "The stage was completed with employee, partner, or support help",
  "This is a team assumption or anecdote",
  "We do not have stage-level evidence",
];

export const outcomeCheckChoices = [
  "A result the developer can verify",
  "A product event, such as signup, key creation, or first request",
  "I am not sure yet",
];

export const lastStageChoices = [
  "No attempt observed",
  "They found or evaluated the platform",
  "They tried to get access or approval",
  "They started setup or implementation",
  "They produced a first result",
  "They verified a meaningful result",
  "We cannot locate the stop yet",
];

export const evidenceChoices = [
  "Direct observation",
  "Product or platform data",
  "Support cases",
  "Developer interview",
  "Team anecdote",
  "Assumption",
  "No evidence yet",
];

export const ownershipChoices = [
  "I can investigate it directly",
  "I can change it directly",
  "I can influence the owner",
  "Another role must decide",
  "The owner is not clear yet",
];

export const moveTypeChoices = [
  "Gather better evidence",
  "Try a small reversible change",
  "Ask another owner for a decision or change",
  "No intervention is justified yet",
];

export const reviewDecisionChoices = [
  "Keep investigating",
  "Try the small change",
  "Hand it to the named owner",
  "No intervention is justified",
  "The case changed and needs reframing",
];

export const friendlyCopy = {
  title: "First Mile",
  welcomeTitle: "Map the journey. Find the break.",
  welcomeBody:
    "Bring one developer journey. Start with access, trace the path to a verified first result, then mark the step that needs attention.",
  welcomeTime: "About 5 minutes. You will leave with a journey map, not a diagnosis from a black box.",
  privacy:
    "Use aliases for people, companies, teams, or projects when needed. Don’t paste secrets, customer data, or private incident details. This prototype saves your work in this browser.",
  uncertainty:
    "You do not need to have the answer. A clear evidence gap is a useful result.",
};
