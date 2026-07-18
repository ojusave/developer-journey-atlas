import { z } from "zod";
import type { ObjectiveId } from "./domain/diagnostic-engine";

const nextQuestionSchema = z.object({
  objectiveId: z.enum(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]),
  prompt: z.string(),
  support: z.string(),
  inputMode: z.enum(["text", "single_choice", "multi_choice"]),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
});

const publicSessionSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().min(0),
  status: z.enum(["active", "processing", "complete"]),
  catalogVersion: z.string(),
  state: z.object({
    revision: z.number().int().min(0),
    answeredObjectiveIds: z.array(z.string()),
    lastReflection: z.string().nullable(),
    nextQuestion: nextQuestionSchema.nullable(),
    terminalState: z.string().nullable(),
  }).passthrough(),
  expiresAt: z.string(),
  pendingTurnId: z.string().uuid().nullable(),
});

const publicTurnSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  objectiveId: z.string(),
  status: z.enum(["accepted", "processing", "completed", "failed", "superseded"]),
  result: z.object({
    reflection: z.string(),
    candidates: z.array(z.object({
      catalogId: z.string(),
      evidenceState: z.enum(["live", "weakened", "contradicted", "needs_observation"]),
      evidenceTurnIds: z.array(z.string()),
    })).default([]),
    nextQuestion: nextQuestionSchema.nullable(),
    terminalState: z.string().nullable(),
    validationWarnings: z.array(z.string()),
  }).passthrough().nullable(),
  errorCode: z.string().nullable(),
  retryable: z.boolean(),
}).passthrough();

const createSessionResponseSchema = z.object({
  session: publicSessionSchema,
  sessionToken: z.string().min(32),
});

const submitTurnResponseSchema = z.object({
  session: publicSessionSchema,
  turn: publicTurnSchema,
  dispatchMode: z.string(),
});

export type AdaptiveSession = z.infer<typeof publicSessionSchema>;
export type AdaptiveNextQuestion = z.infer<typeof nextQuestionSchema>;
export type AdaptiveTurnResponse = z.infer<typeof submitTurnResponseSchema>;

export interface AdaptiveRecovery {
  turnId: string;
  objectiveId: ObjectiveId;
  action: "retry" | "check";
}

export interface AdaptiveCredential {
  sessionId: string;
  sessionToken: string;
  revision: number;
  turnIds: Record<string, string>;
  recovery?: AdaptiveRecovery;
}

export interface AdaptiveContext {
  platformArchetypeIds: string[];
  journeyId?: string;
  stageId?: string;
  actorType?: "human" | "agent" | "both" | "unknown";
}

export type AdaptiveAnswer =
  | { kind: "text"; text: string }
  | { kind: "single_choice"; optionIds: [string]; text?: string }
  | { kind: "multi_choice"; optionIds: string[]; text?: string }
  | { kind: "unknown" };

export class AdaptiveRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdaptiveRequestError";
  }
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null) as {
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!response.ok) {
    throw new AdaptiveRequestError(
      payload?.error?.message ?? "Adaptive help is unavailable.",
      response.status,
      payload?.error?.code ?? "adaptive_request_failed",
      payload?.error?.details,
    );
  }
  return payload;
}

export async function createAdaptiveSession(context: AdaptiveContext, signal?: AbortSignal) {
  return createSessionResponseSchema.parse(await requestJson("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ context }),
    signal,
  }));
}

export async function submitAdaptiveTurn(input: {
  credential: AdaptiveCredential;
  idempotencyKey: string;
  objectiveId: ObjectiveId;
  answer: AdaptiveAnswer;
  correctionOfTurnId?: string;
  signal?: AbortSignal;
}): Promise<AdaptiveTurnResponse> {
  return submitTurnResponseSchema.parse(await requestJson(`/api/sessions/${input.credential.sessionId}/turns`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.credential.sessionToken}`,
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      expectedRevision: input.credential.revision,
      objectiveId: input.objectiveId,
      answer: input.answer,
      ...(input.correctionOfTurnId ? { correctionOfTurnId: input.correctionOfTurnId } : {}),
    }),
    signal: input.signal,
  }));
}

export async function getAdaptiveSession(credential: AdaptiveCredential, signal?: AbortSignal): Promise<AdaptiveSession> {
  const payload = z.object({ session: publicSessionSchema }).parse(await requestJson(`/api/sessions/${credential.sessionId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${credential.sessionToken}` },
    signal,
  }));
  return payload.session;
}

export async function getAdaptiveTurn(
  credential: AdaptiveCredential,
  turnId: string,
  signal?: AbortSignal,
): Promise<AdaptiveTurnResponse["turn"]> {
  const payload = z.object({ turn: publicTurnSchema }).parse(await requestJson(`/api/sessions/${credential.sessionId}/turns/${turnId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${credential.sessionToken}` },
    signal,
  }));
  return payload.turn;
}

export async function retryAdaptiveTurn(
  credential: AdaptiveCredential,
  turnId: string,
  signal?: AbortSignal,
): Promise<AdaptiveTurnResponse> {
  return submitTurnResponseSchema.parse(await requestJson(
    `/api/sessions/${credential.sessionId}/turns/${turnId}/retry`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${credential.sessionToken}` },
      signal,
    },
  ));
}

export async function deleteAdaptiveSession(credential: AdaptiveCredential, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`/api/sessions/${credential.sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${credential.sessionToken}` },
    signal,
  });
  if (!response.ok && response.status !== 404) {
    throw new AdaptiveRequestError("Server deletion could not be confirmed.", response.status, "server_delete_failed");
  }
}

const credentialSchema = z.object({
  sessionId: z.string().uuid(),
  sessionToken: z.string().min(32),
  revision: z.number().int().min(0),
  turnIds: z.record(z.string(), z.string().uuid()).default({}),
  recovery: z.object({
    turnId: z.string().uuid(),
    objectiveId: z.enum(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]),
    action: z.enum(["retry", "check"]),
  }).optional(),
});

const CREDENTIAL_KEY = "first-mile-scanner/adaptive-session/v1";

export function loadAdaptiveCredential(): AdaptiveCredential | null {
  try {
    const value = window.localStorage.getItem(CREDENTIAL_KEY);
    return value ? credentialSchema.parse(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function saveAdaptiveCredential(credential: AdaptiveCredential): void {
  window.localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential));
}

export function clearAdaptiveCredential(): void {
  window.localStorage.removeItem(CREDENTIAL_KEY);
}
