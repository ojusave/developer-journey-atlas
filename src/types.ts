export type ActiveScreenId =
  | "welcome"
  | "profile"
  | "platform-context"
  | "developer"
  | "first-mile"
  | "journey-map"
  | "break-point"
  | "blocker"
  | "summary";

export type LegacyScreenId =
  | "name"
  | "company"
  | "platform"
  | "role"
  | "concern"
  | "developer-job"
  | "outcome"
  | "last-truth"
  | "explanation"
  | "evidence"
  | "discriminator"
  | "ownership"
  | "next-move"
  | "adaptive"
  | "seven-day";

export type ScreenId = ActiveScreenId | LegacyScreenId;

export type PhaseId =
  | "profile"
  | "frame"
  | "map"
  | "locate"
  | "test"
  | "move"
  | "complete";

export type JourneyStepStatus = "in-path" | "not-needed";

export interface JourneyStep {
  id: string;
  catalogStageId: string;
  label: string;
  status: JourneyStepStatus;
}

export function createDefaultJourneySteps(): JourneyStep[] {
  return [
    { id: "encounter", catalogStageId: "S02", label: "Encounter a relevant official starting path", status: "in-path" },
    { id: "decide", catalogStageId: "S02", label: "Decide it is worth trying for their job", status: "in-path" },
    { id: "sign-up", catalogStageId: "S03", label: "Sign up or sign in", status: "in-path" },
    { id: "access", catalogStageId: "S03", label: "Gain the required access and authority", status: "in-path" },
    { id: "setup", catalogStageId: "S04", label: "Prepare the project or environment", status: "in-path" },
    { id: "execute", catalogStageId: "S05", label: "Execute the first representative operation", status: "in-path" },
    { id: "signal", catalogStageId: "S06", label: "Receive a platform response, output, or side effect", status: "in-path" },
    { id: "verify", catalogStageId: "S06", label: "Independently verify the intended result", status: "in-path" },
  ];
}

export interface CaseAnswers {
  name: string;
  company: string;
  platform: string;
  platformSurfaces: string[];
  platformSurfaceOther: string;
  role: string;
  roleOther: string;
  concern: string;
  concernPattern: string;
  developer: string;
  actorType: string;
  developerJob: string;
  outcome: string;
  outcomeCheck: string;
  lastStage: string;
  lastTruth: string;
  explanation: string;
  evidenceTypes: string[];
  evidenceDetail: string;
  alternative: string;
  discriminatorQuestionId: string;
  discriminatorAnswerIds: string[];
  ownershipMode: string;
  ownership: string;
  moveType: string;
  nextMove: string;
  expectedSignal: string;
  reviewDate: string;
  reviewNotes: string;
  reviewDecision: string;
  adaptiveClarifications: Record<string, string>;
  adaptiveCandidates: Array<{
    catalogId: string;
    evidenceState: "live" | "weakened" | "contradicted" | "needs_observation";
  }>;
  adaptiveTerminalState: string;
  journeyType: string;
  meaningfulAction: string;
  representativeInput: string;
  verificationSignal: string;
  journeySteps: JourneyStep[];
  furthestReachedStepId: string;
  breakStepId: string;
  breakEvidenceType: string;
  breakEvidenceDetail: string;
  issueStatement: string;
}

export interface SavedSession {
  version: 1;
  guidanceMode: "adaptive" | "guided";
  screen: ScreenId;
  history: ScreenId[];
  answers: CaseAnswers;
  updatedAt: string;
}

export const emptyAnswers: CaseAnswers = {
  name: "",
  company: "",
  platform: "",
  platformSurfaces: [],
  platformSurfaceOther: "",
  role: "",
  roleOther: "",
  concern: "",
  concernPattern: "",
  developer: "",
  actorType: "",
  developerJob: "",
  outcome: "",
  outcomeCheck: "",
  lastStage: "",
  lastTruth: "",
  explanation: "",
  evidenceTypes: [],
  evidenceDetail: "",
  alternative: "",
  discriminatorQuestionId: "",
  discriminatorAnswerIds: [],
  ownershipMode: "",
  ownership: "",
  moveType: "",
  nextMove: "",
  expectedSignal: "",
  reviewDate: "",
  reviewNotes: "",
  reviewDecision: "",
  adaptiveClarifications: {},
  adaptiveCandidates: [],
  adaptiveTerminalState: "",
  journeyType: "",
  meaningfulAction: "",
  representativeInput: "",
  verificationSignal: "",
  journeySteps: createDefaultJourneySteps(),
  furthestReachedStepId: "",
  breakStepId: "",
  breakEvidenceType: "",
  breakEvidenceDetail: "",
  issueStatement: "",
};
