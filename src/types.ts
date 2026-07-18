export type ScreenId =
  | "welcome"
  | "name"
  | "company"
  | "platform"
  | "role"
  | "concern"
  | "developer"
  | "developer-job"
  | "outcome"
  | "last-truth"
  | "explanation"
  | "evidence"
  | "discriminator"
  | "ownership"
  | "next-move"
  | "adaptive"
  | "summary"
  | "seven-day";

export type PhaseId =
  | "profile"
  | "frame"
  | "locate"
  | "test"
  | "move"
  | "complete";

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
};
