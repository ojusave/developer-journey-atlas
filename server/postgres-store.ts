import { Pool, type PoolClient, type QueryResultRow } from "pg";
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
import { sha256 } from "./privacy.js";
import type {
  AcceptTurnRecord,
  AcceptedTurn,
  ClaimedTurn,
  CompletedTurn,
  CreateSessionRecord,
  DiagnosticStore,
} from "./store.js";

const sessionColumns = `
  id, token_hash, revision, status, pending_turn_id, catalog_version,
  context, state, expires_at, created_at, updated_at
`;

const turnColumns = `
  id, session_id, revision, idempotency_key, input_hash, objective_id,
  correction_of_turn_id, status, encrypted_envelope, result, error_code,
  workflow_run_id, envelope_expires_at, created_at, updated_at
`;

const aliasedTurnColumns = `
  t.id, t.session_id, t.revision, t.idempotency_key, t.input_hash, t.objective_id,
  t.correction_of_turn_id, t.status, t.encrypted_envelope, t.result, t.error_code,
  t.workflow_run_id, t.envelope_expires_at, t.created_at, t.updated_at
`;

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function rowToSession(row: QueryResultRow): SessionRecord {
  return {
    id: row.id as string,
    tokenHash: row.token_hash as string,
    revision: row.revision as number,
    status: row.status as SessionRecord["status"],
    pendingTurnId: (row.pending_turn_id as string | null) ?? null,
    catalogVersion: row.catalog_version as string,
    context: row.context as SessionContext,
    state: row.state as DiagnosticState,
    expiresAt: asDate(row.expires_at),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

function rowToTurn(row: QueryResultRow): TurnRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    revision: row.revision as number,
    idempotencyKey: row.idempotency_key as string,
    inputHash: row.input_hash as string,
    objectiveId: row.objective_id as ObjectiveId,
    correctionOfTurnId: (row.correction_of_turn_id as string | null) ?? null,
    status: row.status as TurnRecord["status"],
    encryptedEnvelope: (row.encrypted_envelope as EncryptedEnvelope | null) ?? null,
    result: (row.result as TurnResult | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    workflowRunId: (row.workflow_run_id as string | null) ?? null,
    envelopeExpiresAt: asDate(row.envelope_expires_at),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

export class PostgresDiagnosticStore implements DiagnosticStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "first-mile-scanner",
    });
  }

  async createSession(record: CreateSessionRecord): Promise<SessionRecord> {
    const result = await this.pool.query(
      `INSERT INTO diagnostic_sessions
        (id, token_hash, catalog_version, context, state, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING ${sessionColumns}`,
      [record.id, record.tokenHash, record.catalogVersion, JSON.stringify(record.context), JSON.stringify(record.state), record.expiresAt],
    );
    return rowToSession(result.rows[0]);
  }

  async getSession(id: string, sessionToken: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `SELECT ${sessionColumns} FROM diagnostic_sessions WHERE id = $1 AND token_hash = $2`,
      [id, sha256(sessionToken)],
    );
    if (!result.rows[0]) return null;
    const session = rowToSession(result.rows[0]);
    this.assertNotExpired(session);
    return session;
  }

  async getSessionInternal(id: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(`SELECT ${sessionColumns} FROM diagnostic_sessions WHERE id = $1`, [id]);
    if (!result.rows[0]) return null;
    const session = rowToSession(result.rows[0]);
    this.assertNotExpired(session);
    return session;
  }

  async deleteSession(id: string, sessionToken: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM diagnostic_sessions WHERE id = $1 AND token_hash = $2",
      [id, sha256(sessionToken)],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async acceptTurn(record: AcceptTurnRecord): Promise<AcceptedTurn> {
    return this.transaction(async (client) => {
      const sessionResult = await client.query(
        `SELECT ${sessionColumns} FROM diagnostic_sessions WHERE id = $1 AND token_hash = $2 FOR UPDATE`,
        [record.sessionId, sha256(record.tokenHash)],
      );
      if (!sessionResult.rows[0]) throw new AppError(404, "session_not_found", "Session not found");
      const session = rowToSession(sessionResult.rows[0]);
      this.assertNotExpired(session);

      const existingResult = await client.query(
        `SELECT ${turnColumns} FROM diagnostic_turns WHERE session_id = $1 AND idempotency_key = $2`,
        [record.sessionId, record.idempotencyKey],
      );
      if (existingResult.rows[0]) {
        const existing = rowToTurn(existingResult.rows[0]);
        if (existing.inputHash !== record.inputHash) {
          throw new AppError(409, "idempotency_conflict", "The idempotency key was already used with different input");
        }
        return { kind: "replay", session, turn: existing };
      }

      if (session.status === "processing") throw new AppError(409, "turn_in_progress", "Wait for the current answer to finish processing");
      if (session.status === "complete" && !record.correctionOfTurnId) {
        throw new AppError(409, "session_complete", "This diagnostic is complete. Correct an accepted answer to reopen it.");
      }
      if (session.revision !== record.expectedRevision) {
        throw new AppError(409, "stale_revision", "The session changed before this answer was accepted", { currentRevision: session.revision });
      }

      const revision = record.expectedRevision + 1;
      const turnResult = await client.query(
        `INSERT INTO diagnostic_turns
          (id, session_id, revision, idempotency_key, input_hash, objective_id,
           correction_of_turn_id, status, encrypted_envelope, envelope_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted', $8::jsonb, $9)
         RETURNING ${turnColumns}`,
        [
          record.id,
          record.sessionId,
          revision,
          record.idempotencyKey,
          record.inputHash,
          record.objectiveId,
          record.correctionOfTurnId,
          JSON.stringify(record.encryptedEnvelope),
          record.envelopeExpiresAt,
        ],
      );
      const updatedSessionResult = await client.query(
        `UPDATE diagnostic_sessions
         SET revision = $2, status = 'processing', pending_turn_id = $3, updated_at = now()
         WHERE id = $1
         RETURNING ${sessionColumns}`,
        [record.sessionId, revision, record.id],
      );
      await client.query(
        `INSERT INTO diagnostic_events (session_id, turn_id, revision, event_type, payload)
         VALUES ($1, $2, $3, 'turn_accepted', $4::jsonb)`,
        [record.sessionId, record.id, revision, JSON.stringify({ objectiveId: record.objectiveId, correctionOfTurnId: record.correctionOfTurnId, inputHash: record.inputHash })],
      );
      return {
        kind: "accepted",
        session: rowToSession(updatedSessionResult.rows[0]),
        turn: rowToTurn(turnResult.rows[0]),
      };
    });
  }

  async retryTurn(sessionId: string, sessionToken: string, turnId: string): Promise<AcceptedTurn> {
    return this.transaction(async (client) => {
      const sessionResult = await client.query(
        `SELECT ${sessionColumns} FROM diagnostic_sessions WHERE id = $1 AND token_hash = $2 FOR UPDATE`,
        [sessionId, sha256(sessionToken)],
      );
      if (!sessionResult.rows[0]) throw new AppError(404, "turn_not_found", "Turn not found");
      const session = rowToSession(sessionResult.rows[0]);
      if (session.status === "processing") throw new AppError(409, "turn_in_progress", "Another turn is processing");
      const turnResult = await client.query(
        `SELECT ${turnColumns} FROM diagnostic_turns WHERE id = $1 AND session_id = $2 FOR UPDATE`,
        [turnId, sessionId],
      );
      if (!turnResult.rows[0]) throw new AppError(404, "turn_not_found", "Turn not found");
      const turn = rowToTurn(turnResult.rows[0]);
      if (turn.status !== "failed" || !turn.encryptedEnvelope || turn.envelopeExpiresAt <= new Date()) {
        throw new AppError(409, "turn_not_retryable", "This turn cannot be retried");
      }
      const updatedTurn = await client.query(
        `UPDATE diagnostic_turns SET status = 'accepted', error_code = NULL, updated_at = now()
         WHERE id = $1 RETURNING ${turnColumns}`,
        [turnId],
      );
      const updatedSession = await client.query(
        `UPDATE diagnostic_sessions SET status = 'processing', pending_turn_id = $2, updated_at = now()
         WHERE id = $1 RETURNING ${sessionColumns}`,
        [sessionId, turnId],
      );
      return { kind: "accepted", session: rowToSession(updatedSession.rows[0]), turn: rowToTurn(updatedTurn.rows[0]) };
    });
  }

  async getTurn(sessionId: string, sessionToken: string, turnId: string): Promise<TurnRecord | null> {
    const result = await this.pool.query(
      `SELECT ${aliasedTurnColumns}
       FROM diagnostic_turns t
       JOIN diagnostic_sessions s ON s.id = t.session_id
       WHERE t.id = $1 AND t.session_id = $2 AND s.token_hash = $3`,
      [turnId, sessionId, sha256(sessionToken)],
    );
    return result.rows[0] ? rowToTurn(result.rows[0]) : null;
  }

  async claimTurn(turnId: string, revision: number, idempotencyKey: string): Promise<ClaimedTurn> {
    return this.transaction(async (client) => {
      const lookup = await client.query("SELECT session_id FROM diagnostic_turns WHERE id = $1", [turnId]);
      if (!lookup.rows[0]) throw new AppError(404, "turn_not_found", "Turn not found");
      const sessionResult = await client.query(
        `SELECT ${sessionColumns} FROM diagnostic_sessions WHERE id = $1 FOR UPDATE`,
        [lookup.rows[0].session_id],
      );
      if (!sessionResult.rows[0]) throw new AppError(404, "session_not_found", "Session not found");
      const turnResult = await client.query(`SELECT ${turnColumns} FROM diagnostic_turns WHERE id = $1 FOR UPDATE`, [turnId]);
      let session = rowToSession(sessionResult.rows[0]);
      let turn = rowToTurn(turnResult.rows[0]);
      if (turn.status === "completed") return { kind: "duplicate", session, turn };
      if (turn.status === "superseded") return { kind: "superseded", session, turn };
      if (
        turn.status === "failed"
        && turn.revision === revision
        && turn.idempotencyKey === idempotencyKey
        && session.revision === revision
        && session.status === "active"
        && session.pendingTurnId === null
      ) {
        const reactivated = await client.query(
          `UPDATE diagnostic_sessions SET status = 'processing', pending_turn_id = $2, updated_at = now()
           WHERE id = $1 RETURNING ${sessionColumns}`,
          [session.id, turnId],
        );
        session = rowToSession(reactivated.rows[0]);
      }
      if (turn.revision !== revision || turn.idempotencyKey !== idempotencyKey || session.revision !== revision || session.pendingTurnId !== turnId) {
        const superseded = await client.query(
          `UPDATE diagnostic_turns SET status = 'superseded', encrypted_envelope = NULL, updated_at = now()
           WHERE id = $1 RETURNING ${turnColumns}`,
          [turnId],
        );
        return { kind: "superseded", session, turn: rowToTurn(superseded.rows[0]) };
      }
      if (!turn.encryptedEnvelope || turn.envelopeExpiresAt <= new Date()) {
        throw new AppError(410, "turn_envelope_expired", "The short-lived answer envelope expired");
      }
      const processing = await client.query(
        `UPDATE diagnostic_turns SET status = 'processing', updated_at = now() WHERE id = $1 RETURNING ${turnColumns}`,
        [turnId],
      );
      turn = rowToTurn(processing.rows[0]);
      return { kind: "claimed", session, turn };
    });
  }

  async markWorkflowDispatched(turnId: string, workflowRunId: string): Promise<void> {
    const result = await this.pool.query(
      "UPDATE diagnostic_turns SET workflow_run_id = $2, updated_at = now() WHERE id = $1",
      [turnId, workflowRunId],
    );
    if (!result.rowCount) throw new AppError(404, "turn_not_found", "Turn not found");
  }

  async completeTurn(turnId: string, state: DiagnosticState, result: TurnResult): Promise<CompletedTurn> {
    return this.transaction(async (client) => {
      const lookup = await client.query("SELECT session_id FROM diagnostic_turns WHERE id = $1", [turnId]);
      if (!lookup.rows[0]) throw new AppError(404, "turn_not_found", "Turn not found");
      const sessionResult = await client.query(
        `SELECT ${sessionColumns} FROM diagnostic_sessions WHERE id = $1 FOR UPDATE`,
        [lookup.rows[0].session_id],
      );
      const turnResult = await client.query(`SELECT ${turnColumns} FROM diagnostic_turns WHERE id = $1 FOR UPDATE`, [turnId]);
      let session = rowToSession(sessionResult.rows[0]);
      let turn = rowToTurn(turnResult.rows[0]);
      if (turn.status === "completed") return { kind: "duplicate", session, turn };
      if (session.revision !== turn.revision || session.pendingTurnId !== turn.id) {
        const superseded = await client.query(
          `UPDATE diagnostic_turns SET status = 'superseded', encrypted_envelope = NULL, updated_at = now()
           WHERE id = $1 RETURNING ${turnColumns}`,
          [turnId],
        );
        return { kind: "superseded", session, turn: rowToTurn(superseded.rows[0]) };
      }
      const status = state.terminalState ? "complete" : "active";
      const updatedSession = await client.query(
        `UPDATE diagnostic_sessions
         SET state = $2::jsonb, status = $3, pending_turn_id = NULL, updated_at = now()
         WHERE id = $1 RETURNING ${sessionColumns}`,
        [session.id, JSON.stringify(state), status],
      );
      const updatedTurn = await client.query(
        `UPDATE diagnostic_turns
         SET status = 'completed', encrypted_envelope = NULL, result = $2::jsonb,
             error_code = NULL, updated_at = now()
         WHERE id = $1 RETURNING ${turnColumns}`,
        [turnId, JSON.stringify(result)],
      );
      await client.query(
        `INSERT INTO diagnostic_events (session_id, turn_id, revision, event_type, payload)
         VALUES ($1, $2, $3, 'turn_completed', $4::jsonb)`,
        [session.id, turnId, turn.revision, JSON.stringify({ objectiveId: turn.objectiveId, candidateIds: state.candidates.map((candidate) => candidate.catalogId), terminalState: state.terminalState })],
      );
      session = rowToSession(updatedSession.rows[0]);
      turn = rowToTurn(updatedTurn.rows[0]);
      return { kind: "applied", session, turn };
    });
  }

  async failTurn(turnId: string, errorCode: string): Promise<void> {
    await this.transaction(async (client) => {
      const turnResult = await client.query(`SELECT ${turnColumns} FROM diagnostic_turns WHERE id = $1 FOR UPDATE`, [turnId]);
      if (!turnResult.rows[0]) return;
      const turn = rowToTurn(turnResult.rows[0]);
      if (turn.status === "completed" || turn.status === "superseded") return;
      await client.query(
        "UPDATE diagnostic_turns SET status = 'failed', error_code = $2, updated_at = now() WHERE id = $1",
        [turnId, errorCode],
      );
      await client.query(
        `UPDATE diagnostic_sessions SET status = 'active', pending_turn_id = NULL, updated_at = now()
         WHERE id = $1 AND pending_turn_id = $2`,
        [turn.sessionId, turnId],
      );
      await client.query(
        `INSERT INTO diagnostic_events (session_id, turn_id, revision, event_type, payload)
         VALUES ($1, $2, $3, 'turn_failed', $4::jsonb)`,
        [turn.sessionId, turnId, turn.revision, JSON.stringify({ errorCode })],
      );
    });
  }

  async purgeExpired(): Promise<{ sessionsDeleted: number; envelopesCleared: number }> {
    return this.transaction(async (client) => {
      const expiredSessions = await client.query("DELETE FROM diagnostic_sessions WHERE expires_at <= now()");
      const expiredEnvelopes = await client.query(
        `UPDATE diagnostic_turns
         SET encrypted_envelope = NULL,
             status = CASE WHEN status IN ('accepted', 'processing') THEN 'failed' ELSE status END,
             error_code = COALESCE(error_code, 'turn_envelope_expired'),
             updated_at = now()
         WHERE encrypted_envelope IS NOT NULL AND envelope_expires_at <= now()
         RETURNING id`,
      );
      const expiredTurnIds = expiredEnvelopes.rows.map((row) => row.id as string);
      if (expiredTurnIds.length > 0) {
        await client.query(
          `UPDATE diagnostic_sessions
           SET status = 'active', pending_turn_id = NULL, updated_at = now()
           WHERE pending_turn_id = ANY($1::uuid[])`,
          [expiredTurnIds],
        );
      }
      return {
        sessionsDeleted: expiredSessions.rowCount ?? 0,
        envelopesCleared: expiredEnvelopes.rowCount ?? 0,
      };
    });
  }

  async healthCheck(): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 AS healthy");
    return result.rows[0]?.healthy === 1;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private assertNotExpired(session: SessionRecord): void {
    if (session.expiresAt <= new Date()) throw new AppError(410, "session_expired", "This session has expired");
  }
}
