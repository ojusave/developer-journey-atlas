import type {
  DiagnosticState,
  EncryptedEnvelope,
  ObjectiveId,
  SessionContext,
  SessionRecord,
  TurnRecord,
  TurnResult,
} from "./domain.js";
import { AppError } from "./errors.js";
import { tokenMatches } from "./privacy.js";

export interface CreateSessionRecord {
  id: string;
  tokenHash: string;
  catalogVersion: string;
  context: SessionContext;
  state: DiagnosticState;
  expiresAt: Date;
}

export interface AcceptTurnRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  expectedRevision: number;
  idempotencyKey: string;
  inputHash: string;
  objectiveId: ObjectiveId;
  correctionOfTurnId: string | null;
  encryptedEnvelope: EncryptedEnvelope;
  envelopeExpiresAt: Date;
}

export interface AcceptedTurn {
  kind: "accepted" | "replay";
  session: SessionRecord;
  turn: TurnRecord;
}

export interface ClaimedTurn {
  kind: "claimed" | "duplicate" | "superseded";
  session: SessionRecord;
  turn: TurnRecord;
}

export interface CompletedTurn {
  kind: "applied" | "duplicate" | "superseded";
  session: SessionRecord;
  turn: TurnRecord;
}

export interface DiagnosticStore {
  createSession(record: CreateSessionRecord): Promise<SessionRecord>;
  getSession(id: string, tokenHash: string): Promise<SessionRecord | null>;
  getSessionInternal(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string, tokenHash: string): Promise<boolean>;
  acceptTurn(record: AcceptTurnRecord): Promise<AcceptedTurn>;
  retryTurn(sessionId: string, tokenHash: string, turnId: string): Promise<AcceptedTurn>;
  getTurn(sessionId: string, tokenHash: string, turnId: string): Promise<TurnRecord | null>;
  claimTurn(turnId: string, revision: number, idempotencyKey: string): Promise<ClaimedTurn>;
  markWorkflowDispatched(turnId: string, workflowRunId: string): Promise<void>;
  completeTurn(turnId: string, state: DiagnosticState, result: TurnResult): Promise<CompletedTurn>;
  failTurn(turnId: string, errorCode: string): Promise<void>;
  purgeExpired(): Promise<{ sessionsDeleted: number; envelopesCleared: number }>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryDiagnosticStore implements DiagnosticStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly turns = new Map<string, TurnRecord>();

  async createSession(record: CreateSessionRecord): Promise<SessionRecord> {
    const now = new Date();
    const session: SessionRecord = {
      ...record,
      revision: 0,
      status: "active",
      pendingTurnId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    return clone(session);
  }

  async getSession(id: string, tokenHash: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    if (!session || !tokenMatches(tokenHash, session.tokenHash)) return null;
    this.assertNotExpired(session);
    return clone(session);
  }

  async getSessionInternal(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    this.assertNotExpired(session);
    return clone(session);
  }

  async deleteSession(id: string, tokenHash: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || !tokenMatches(tokenHash, session.tokenHash)) return false;
    this.sessions.delete(id);
    for (const [turnId, turn] of this.turns) {
      if (turn.sessionId === id) this.turns.delete(turnId);
    }
    return true;
  }

  async acceptTurn(record: AcceptTurnRecord): Promise<AcceptedTurn> {
    const session = this.sessions.get(record.sessionId);
    if (!session || !tokenMatches(record.tokenHash, session.tokenHash)) throw new AppError(404, "session_not_found", "Session not found");
    this.assertNotExpired(session);
    const existing = [...this.turns.values()].find(
      (turn) => turn.sessionId === record.sessionId && turn.idempotencyKey === record.idempotencyKey,
    );
    if (existing) {
      if (existing.inputHash !== record.inputHash) throw new AppError(409, "idempotency_conflict", "The idempotency key was already used with different input");
      return { kind: "replay", session: clone(session), turn: clone(existing) };
    }
    if (session.status === "processing") throw new AppError(409, "turn_in_progress", "Wait for the current answer to finish processing");
    if (session.status === "complete" && !record.correctionOfTurnId) {
      throw new AppError(409, "session_complete", "This diagnostic is complete. Correct an accepted answer to reopen it.");
    }
    if (session.revision !== record.expectedRevision) {
      throw new AppError(409, "stale_revision", "The session changed before this answer was accepted", { currentRevision: session.revision });
    }
    const now = new Date();
    const turn: TurnRecord = {
      id: record.id,
      sessionId: record.sessionId,
      revision: record.expectedRevision + 1,
      idempotencyKey: record.idempotencyKey,
      inputHash: record.inputHash,
      objectiveId: record.objectiveId,
      correctionOfTurnId: record.correctionOfTurnId,
      status: "accepted",
      encryptedEnvelope: record.encryptedEnvelope,
      result: null,
      errorCode: null,
      workflowRunId: null,
      envelopeExpiresAt: record.envelopeExpiresAt,
      createdAt: now,
      updatedAt: now,
    };
    session.revision = turn.revision;
    session.status = "processing";
    session.pendingTurnId = turn.id;
    session.updatedAt = now;
    this.turns.set(turn.id, turn);
    return { kind: "accepted", session: clone(session), turn: clone(turn) };
  }

  async retryTurn(sessionId: string, tokenHash: string, turnId: string): Promise<AcceptedTurn> {
    const session = this.sessions.get(sessionId);
    const turn = this.turns.get(turnId);
    if (!session || !tokenMatches(tokenHash, session.tokenHash) || !turn || turn.sessionId !== sessionId) {
      throw new AppError(404, "turn_not_found", "Turn not found");
    }
    if (turn.status !== "failed" || !turn.encryptedEnvelope || turn.envelopeExpiresAt <= new Date()) {
      throw new AppError(409, "turn_not_retryable", "This turn cannot be retried");
    }
    if (session.status === "processing") throw new AppError(409, "turn_in_progress", "Another turn is processing");
    session.status = "processing";
    session.pendingTurnId = turn.id;
    session.updatedAt = new Date();
    turn.status = "accepted";
    turn.errorCode = null;
    turn.updatedAt = new Date();
    return { kind: "accepted", session: clone(session), turn: clone(turn) };
  }

  async getTurn(sessionId: string, tokenHash: string, turnId: string): Promise<TurnRecord | null> {
    const session = this.sessions.get(sessionId);
    const turn = this.turns.get(turnId);
    if (!session || !tokenMatches(tokenHash, session.tokenHash) || !turn || turn.sessionId !== sessionId) return null;
    return clone(turn);
  }

  async claimTurn(turnId: string, revision: number, idempotencyKey: string): Promise<ClaimedTurn> {
    const turn = this.turns.get(turnId);
    if (!turn) throw new AppError(404, "turn_not_found", "Turn not found");
    const session = this.sessions.get(turn.sessionId);
    if (!session) throw new AppError(404, "session_not_found", "Session not found");
    if (turn.status === "completed") return { kind: "duplicate", session: clone(session), turn: clone(turn) };
    if (turn.status === "superseded") return { kind: "superseded", session: clone(session), turn: clone(turn) };
    if (
      turn.status === "failed"
      && turn.revision === revision
      && turn.idempotencyKey === idempotencyKey
      && session.revision === revision
      && session.status === "active"
      && session.pendingTurnId === null
    ) {
      session.status = "processing";
      session.pendingTurnId = turnId;
      session.updatedAt = new Date();
    }
    if (turn.revision !== revision || turn.idempotencyKey !== idempotencyKey || session.revision !== revision || session.pendingTurnId !== turnId) {
      turn.status = "superseded";
      turn.encryptedEnvelope = null;
      return { kind: "superseded", session: clone(session), turn: clone(turn) };
    }
    if (!turn.encryptedEnvelope || turn.envelopeExpiresAt <= new Date()) {
      throw new AppError(410, "turn_envelope_expired", "The short-lived answer envelope expired");
    }
    turn.status = "processing";
    turn.updatedAt = new Date();
    return { kind: "claimed", session: clone(session), turn: clone(turn) };
  }

  async markWorkflowDispatched(turnId: string, workflowRunId: string): Promise<void> {
    const turn = this.turns.get(turnId);
    if (!turn) throw new AppError(404, "turn_not_found", "Turn not found");
    turn.workflowRunId = workflowRunId;
    turn.updatedAt = new Date();
  }

  async completeTurn(turnId: string, state: DiagnosticState, result: TurnResult): Promise<CompletedTurn> {
    const turn = this.turns.get(turnId);
    if (!turn) throw new AppError(404, "turn_not_found", "Turn not found");
    const session = this.sessions.get(turn.sessionId);
    if (!session) throw new AppError(404, "session_not_found", "Session not found");
    if (turn.status === "completed") return { kind: "duplicate", session: clone(session), turn: clone(turn) };
    if (session.revision !== turn.revision || session.pendingTurnId !== turn.id) {
      turn.status = "superseded";
      turn.encryptedEnvelope = null;
      return { kind: "superseded", session: clone(session), turn: clone(turn) };
    }
    const now = new Date();
    session.state = state;
    session.status = state.terminalState ? "complete" : "active";
    session.pendingTurnId = null;
    session.updatedAt = now;
    turn.status = "completed";
    turn.encryptedEnvelope = null;
    turn.result = result;
    turn.errorCode = null;
    turn.updatedAt = now;
    return { kind: "applied", session: clone(session), turn: clone(turn) };
  }

  async failTurn(turnId: string, errorCode: string): Promise<void> {
    const turn = this.turns.get(turnId);
    if (!turn) return;
    if (turn.status === "completed" || turn.status === "superseded") return;
    const session = this.sessions.get(turn.sessionId);
    turn.status = "failed";
    turn.errorCode = errorCode;
    turn.updatedAt = new Date();
    if (session?.pendingTurnId === turnId) {
      session.status = "active";
      session.pendingTurnId = null;
      session.updatedAt = new Date();
    }
  }

  async purgeExpired(): Promise<{ sessionsDeleted: number; envelopesCleared: number }> {
    const now = new Date();
    let sessionsDeleted = 0;
    let envelopesCleared = 0;
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
        sessionsDeleted += 1;
        for (const [turnId, turn] of this.turns) {
          if (turn.sessionId === sessionId) this.turns.delete(turnId);
        }
      }
    }
    for (const turn of this.turns.values()) {
      if (turn.encryptedEnvelope && turn.envelopeExpiresAt <= now) {
        turn.encryptedEnvelope = null;
        if (turn.status === "accepted" || turn.status === "processing") {
          turn.status = "failed";
          turn.errorCode = "turn_envelope_expired";
          const session = this.sessions.get(turn.sessionId);
          if (session?.pendingTurnId === turn.id) {
            session.status = "active";
            session.pendingTurnId = null;
            session.updatedAt = now;
          }
        } else {
          turn.errorCode ??= "turn_envelope_expired";
        }
        turn.updatedAt = now;
        envelopesCleared += 1;
      }
    }
    return { sessionsDeleted, envelopesCleared };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  private assertNotExpired(session: SessionRecord): void {
    if (session.expiresAt <= new Date()) {
      this.sessions.delete(session.id);
      throw new AppError(410, "session_expired", "This session has expired");
    }
  }
}
