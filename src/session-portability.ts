import { z } from "zod";
import type { CaseAnswers } from "./types";

const caseAnswersSchema = z.object({
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
});

const portableCaseSchema = z.object({
  schema: z.literal("first-mile-scanner/case"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  researchVersion: z.string().min(1),
  answers: caseAnswersSchema,
});

export type PortableCase = z.infer<typeof portableCaseSchema>;

export function createPortableCase(answers: CaseAnswers, researchVersion: string, now = new Date()): PortableCase {
  return {
    schema: "first-mile-scanner/case",
    version: 1,
    exportedAt: now.toISOString(),
    researchVersion,
    answers,
  };
}

export function serializePortableCase(portableCase: PortableCase): string {
  return `${JSON.stringify(portableCase, null, 2)}\n`;
}

export function parsePortableCase(text: string): PortableCase {
  const parsed: unknown = JSON.parse(text);
  return portableCaseSchema.parse(parsed);
}

export function safeFilename(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || fallback;
}
