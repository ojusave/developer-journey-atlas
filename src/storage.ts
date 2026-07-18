import { z } from "zod";
import { createDefaultJourneySteps, type SavedSession } from "./types";

const STORAGE_KEY = "first-mile-scanner/session/v1";

const answerSchema = z.object({
  name: z.string(),
  company: z.string(),
  platform: z.string(),
  platformSurfaces: z.array(z.string()),
  platformSurfaceOther: z.string().default(""),
  role: z.string(),
  roleOther: z.string(),
  concern: z.string(),
  concernPattern: z.string(),
  developer: z.string(),
  actorType: z.string(),
  developerJob: z.string(),
  outcome: z.string(),
  outcomeCheck: z.string(),
  lastStage: z.string(),
  lastTruth: z.string(),
  explanation: z.string(),
  evidenceTypes: z.array(z.string()),
  evidenceDetail: z.string(),
  alternative: z.string(),
  discriminatorQuestionId: z.string(),
  discriminatorAnswerIds: z.array(z.string()),
  ownershipMode: z.string(),
  ownership: z.string(),
  moveType: z.string(),
  nextMove: z.string(),
  expectedSignal: z.string(),
  reviewDate: z.string().default(""),
  reviewNotes: z.string().default(""),
  reviewDecision: z.string().default(""),
  adaptiveClarifications: z.record(z.string(), z.string()).default({}),
  adaptiveCandidates: z.array(z.object({
    catalogId: z.string(),
    evidenceState: z.enum(["live", "weakened", "contradicted", "needs_observation"]),
  })).default([]),
  adaptiveTerminalState: z.string().default(""),
  journeyType: z.string().default(""),
  meaningfulAction: z.string().default(""),
  representativeInput: z.string().default(""),
  verificationSignal: z.string().default(""),
  journeySteps: z.array(z.object({
    id: z.string(),
    catalogStageId: z.string(),
    label: z.string(),
    status: z.enum(["in-path", "not-needed"]),
  })).default(createDefaultJourneySteps()),
  furthestReachedStepId: z.string().default(""),
  breakStepId: z.string().default(""),
  breakEvidenceType: z.string().default(""),
  breakEvidenceDetail: z.string().default(""),
  issueStatement: z.string().default(""),
});

const screenSchema = z.enum([
  "welcome",
  "profile",
  "platform-context",
  "first-mile",
  "journey-map",
  "break-point",
  "blocker",
  "name",
  "company",
  "platform",
  "role",
  "concern",
  "developer",
  "developer-job",
  "outcome",
  "last-truth",
  "explanation",
  "evidence",
  "discriminator",
  "ownership",
  "next-move",
  "adaptive",
  "summary",
  "seven-day",
]);

const sessionSchema = z.object({
  version: z.literal(1),
  guidanceMode: z.enum(["adaptive", "guided"]).default("guided"),
  screen: screenSchema,
  history: z.array(screenSchema),
  answers: answerSchema,
  updatedAt: z.string(),
});

export function loadSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
