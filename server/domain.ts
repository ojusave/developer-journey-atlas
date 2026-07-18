import { z } from "zod";

export const objectiveIds = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"] as const;
export const objectiveIdSchema = z.enum(objectiveIds);
export type ObjectiveId = z.infer<typeof objectiveIdSchema>;

export const actorTypeSchema = z.enum(["human", "agent", "both", "unknown"]);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const sessionContextSchema = z.object({
  platformArchetypeIds: z.array(z.string().regex(/^P\d{2}$/)).max(8).default([]),
  journeyId: z.string().regex(/^J\d{2}$/).optional(),
  stageId: z.string().regex(/^S\d{2}$/).optional(),
  actorType: actorTypeSchema.optional(),
}).strict();
export type SessionContext = z.infer<typeof sessionContextSchema>;

export const answerSchema = z.object({
  kind: z.enum(["text", "single_choice", "multi_choice", "unknown"]),
  text: z.string().trim().min(1).max(4_000).optional(),
  optionIds: z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/)).max(12).optional(),
}).strict().superRefine((answer, context) => {
  if (answer.kind === "text" && !answer.text) {
    context.addIssue({ code: "custom", message: "Text answers require text" });
  }
  if ((answer.kind === "single_choice" || answer.kind === "multi_choice") && !answer.optionIds?.length) {
    context.addIssue({ code: "custom", message: "Choice answers require optionIds" });
  }
  if (answer.kind === "single_choice" && answer.optionIds?.length !== 1) {
    context.addIssue({ code: "custom", message: "Single choice answers require one option" });
  }
});
export type DiagnosticAnswer = z.infer<typeof answerSchema>;

export const createSessionSchema = z.object({
  context: sessionContextSchema.default({ platformArchetypeIds: [] }),
}).strict();

export const submitTurnSchema = z.object({
  expectedRevision: z.number().int().min(0),
  objectiveId: objectiveIdSchema,
  answer: answerSchema,
  correctionOfTurnId: z.string().uuid().optional(),
}).strict();
export type SubmitTurn = z.infer<typeof submitTurnSchema>;

export const workflowTurnSchema = z.object({
  turnId: z.string().uuid(),
  sessionRevision: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict();
export type WorkflowTurnInput = z.infer<typeof workflowTurnSchema>;

export const candidateEvidenceStates = ["live", "weakened", "contradicted", "needs_observation"] as const;
export type CandidateEvidenceState = (typeof candidateEvidenceStates)[number];

export const terminalStates = [
  "focus_clarified",
  "hypothesis_ready",
  "needs_evidence",
  "action_ready",
  "catalog_gap",
  "compound_blockers",
  "legitimate_gate",
  "deliberate_non_fit",
  "user_declines",
  "safety_boundary",
] as const;
export type TerminalState = (typeof terminalStates)[number];

export interface CandidateState {
  catalogId: string;
  evidenceState: CandidateEvidenceState;
  evidenceTurnIds: string[];
}

export interface NextQuestion {
  objectiveId: ObjectiveId;
  prompt: string;
  support: string;
  inputMode: "text" | "single_choice" | "multi_choice";
  options: Array<{ id: string; label: string }>;
}

export interface DiagnosticState {
  schemaVersion: 1;
  catalogVersion: string;
  revision: number;
  answeredObjectiveIds: ObjectiveId[];
  objectiveAttempts: Partial<Record<ObjectiveId, number>>;
  candidates: CandidateState[];
  acceptedTurnIds: string[];
  promptControlTurnIds?: string[];
  turnObjectives: Record<string, ObjectiveId>;
  retractedTurnIds: string[];
  lastReflection: string | null;
  nextQuestion: NextQuestion | null;
  terminalState: TerminalState | null;
  extendedPromptBudgetApproved?: boolean;
}

export type SessionStatus = "active" | "processing" | "complete";
export type TurnStatus = "accepted" | "processing" | "completed" | "failed" | "superseded";

export interface SessionRecord {
  id: string;
  tokenHash: string;
  revision: number;
  status: SessionStatus;
  pendingTurnId: string | null;
  catalogVersion: string;
  context: SessionContext;
  state: DiagnosticState;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedEnvelope {
  version: 1;
  keyVersion: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface TurnEnvelope {
  sessionId: string;
  turnId: string;
  revision: number;
  objectiveId: ObjectiveId;
  answer: DiagnosticAnswer;
  correctionOfTurnId?: string;
  acceptedAt: string;
}

export interface TurnResult {
  turnId: string;
  revision: number;
  reflection: string;
  candidates: CandidateState[];
  nextQuestion: NextQuestion | null;
  terminalState: TerminalState | null;
  reasoningMode: "deterministic" | "mastra";
  validationWarnings: string[];
}

export interface TurnRecord {
  id: string;
  sessionId: string;
  revision: number;
  idempotencyKey: string;
  inputHash: string;
  objectiveId: ObjectiveId;
  correctionOfTurnId: string | null;
  status: TurnStatus;
  encryptedEnvelope: EncryptedEnvelope | null;
  result: TurnResult | null;
  errorCode: string | null;
  workflowRunId: string | null;
  envelopeExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicSession {
  id: string;
  revision: number;
  status: SessionStatus;
  catalogVersion: string;
  state: DiagnosticState;
  expiresAt: string;
  pendingTurnId: string | null;
}

export function publicSession(session: SessionRecord): PublicSession {
  return {
    id: session.id,
    revision: session.revision,
    status: session.status,
    catalogVersion: session.catalogVersion,
    state: session.state,
    expiresAt: session.expiresAt.toISOString(),
    pendingTurnId: session.pendingTurnId,
  };
}
