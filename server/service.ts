import { randomUUID } from "node:crypto";
import type { DiagnosticCatalog } from "./catalog.js";
import type { RuntimeConfig } from "./config.js";
import {
  publicSession,
  type DiagnosticState,
  type PublicSession,
  type SubmitTurn,
  type TurnEnvelope,
  type TurnRecord,
  type TurnResult,
  type WorkflowTurnInput,
  type SessionContext,
} from "./domain.js";
import type { TurnDispatcher } from "./dispatcher.js";
import { AppError } from "./errors.js";
import { defaultQuestionFor } from "./objective-policy.js";
import { createSessionCredential, hashInput, type EnvelopeCipher, type SafeLogger } from "./privacy.js";
import type { TurnProcessor } from "./processor.js";
import type { DiagnosticStore } from "./store.js";

export interface PublicTurn {
  id: string;
  revision: number;
  objectiveId: string;
  status: TurnRecord["status"];
  result: TurnResult | null;
  errorCode: string | null;
  retryable: boolean;
  workflowRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

function publicTurn(turn: TurnRecord): PublicTurn {
  return {
    id: turn.id,
    revision: turn.revision,
    objectiveId: turn.objectiveId,
    status: turn.status,
    result: turn.result,
    errorCode: turn.errorCode,
    retryable: turn.status === "failed" && Boolean(turn.encryptedEnvelope) && turn.envelopeExpiresAt > new Date(),
    workflowRunId: turn.workflowRunId,
    createdAt: turn.createdAt.toISOString(),
    updatedAt: turn.updatedAt.toISOString(),
  };
}

export class DiagnosticService {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly store: DiagnosticStore,
    private readonly catalog: DiagnosticCatalog,
    private readonly cipher: EnvelopeCipher,
    private readonly dispatcher: TurnDispatcher,
    private readonly processor: TurnProcessor,
    private readonly logger: SafeLogger,
  ) {}

  async createSession(context: SessionContext): Promise<{ session: PublicSession; sessionToken: string }> {
    const contextErrors = this.catalog.validateContext(context);
    if (contextErrors.length > 0) throw new AppError(400, "invalid_catalog_context", "The supplied catalog context is not valid", contextErrors);
    const id = randomUUID();
    const credential = createSessionCredential();
    const state: DiagnosticState = {
      schemaVersion: 1,
      catalogVersion: this.catalog.version,
      revision: 0,
      answeredObjectiveIds: [],
      objectiveAttempts: {},
      candidates: [],
      acceptedTurnIds: [],
      promptControlTurnIds: [],
      turnObjectives: {},
      retractedTurnIds: [],
      lastReflection: null,
      nextQuestion: defaultQuestionFor("D1"),
      terminalState: null,
      extendedPromptBudgetApproved: false,
    };
    const session = await this.store.createSession({
      id,
      tokenHash: credential.tokenHash,
      catalogVersion: this.catalog.version,
      context,
      state,
      expiresAt: new Date(Date.now() + this.config.sessionTtlHours * 60 * 60 * 1_000),
    });
    this.logger.info({ event: "diagnostic_session_created", sessionId: id, revision: 0 });
    return { session: publicSession(session), sessionToken: credential.token };
  }

  async getSession(sessionId: string, sessionToken: string): Promise<PublicSession> {
    const session = await this.store.getSession(sessionId, sessionToken);
    if (!session) throw new AppError(404, "session_not_found", "Session not found");
    return publicSession(session);
  }

  async deleteSession(sessionId: string, sessionToken: string): Promise<void> {
    const deleted = await this.store.deleteSession(sessionId, sessionToken);
    if (!deleted) throw new AppError(404, "session_not_found", "Session not found");
    this.logger.info({ event: "diagnostic_session_deleted", sessionId });
  }

  async submitTurn(sessionId: string, sessionToken: string, idempotencyKey: string, input: SubmitTurn): Promise<{ session: PublicSession; turn: PublicTurn; dispatchMode: string }> {
    const session = await this.store.getSession(sessionId, sessionToken);
    if (!session) throw new AppError(404, "session_not_found", "Session not found");
    if (input.expectedRevision === session.revision) {
      if (input.correctionOfTurnId) {
        const corrected = await this.store.getTurn(sessionId, sessionToken, input.correctionOfTurnId);
        if (!corrected) throw new AppError(400, "invalid_correction", "The correction target is not part of this session");
        if (corrected.objectiveId !== input.objectiveId) {
          throw new AppError(400, "invalid_correction", "A correction must answer the same diagnostic objective");
        }
      } else if (session.state.nextQuestion?.objectiveId && input.objectiveId !== session.state.nextQuestion.objectiveId) {
        throw new AppError(409, "unexpected_objective", "This answer does not match the current diagnostic question", {
          expectedObjectiveId: session.state.nextQuestion.objectiveId,
        });
      }
    }

    const turnId = randomUUID();
    const revision = session.revision + 1;
    const envelope: TurnEnvelope = {
      sessionId,
      turnId,
      revision,
      objectiveId: input.objectiveId,
      answer: input.answer,
      correctionOfTurnId: input.correctionOfTurnId,
      acceptedAt: new Date().toISOString(),
    };
    const inputHash = hashInput(input, this.config.envelopeKey);
    const accepted = await this.store.acceptTurn({
      id: turnId,
      sessionId,
      tokenHash: sessionToken,
      expectedRevision: input.expectedRevision,
      idempotencyKey,
      inputHash,
      objectiveId: input.objectiveId,
      correctionOfTurnId: input.correctionOfTurnId ?? null,
      encryptedEnvelope: this.cipher.encrypt(envelope),
      envelopeExpiresAt: new Date(Date.now() + this.config.turnEnvelopeTtlSeconds * 1_000),
    });

    if (accepted.kind === "replay") {
      return { session: publicSession(accepted.session), turn: publicTurn(accepted.turn), dispatchMode: "replay" };
    }

    const workflowInput: WorkflowTurnInput = { turnId, sessionRevision: revision, idempotencyKey };
    let dispatchMode: string;
    try {
      const dispatched = await this.dispatcher.dispatch(workflowInput);
      dispatchMode = dispatched.mode;
    } catch (error) {
      await this.store.failTurn(turnId, this.config.executionMode === "render_workflow" ? "workflow_dispatch_failed" : "turn_processing_failed");
      this.logger.error({ event: "diagnostic_turn_dispatch_failed", sessionId, turnId, revision, objectiveId: input.objectiveId, errorCode: error instanceof AppError ? error.code : "unexpected_error" });
      throw new AppError(503, "turn_retryable", "The answer was saved but could not be processed. Retry this turn without re-entering it.", { turnId });
    }
    const currentSession = await this.store.getSession(sessionId, sessionToken);
    const currentTurn = await this.store.getTurn(sessionId, sessionToken, turnId);
    if (!currentSession || !currentTurn) throw new AppError(500, "turn_state_missing", "The accepted turn could not be read after dispatch");
    return { session: publicSession(currentSession), turn: publicTurn(currentTurn), dispatchMode };
  }

  async retryTurn(sessionId: string, sessionToken: string, turnId: string): Promise<{ session: PublicSession; turn: PublicTurn; dispatchMode: string }> {
    const accepted = await this.store.retryTurn(sessionId, sessionToken, turnId);
    const workflowInput: WorkflowTurnInput = {
      turnId: accepted.turn.id,
      sessionRevision: accepted.turn.revision,
      idempotencyKey: accepted.turn.idempotencyKey,
    };
    try {
      const dispatched = await this.dispatcher.dispatch(workflowInput);
      const session = await this.store.getSession(sessionId, sessionToken);
      const turn = await this.store.getTurn(sessionId, sessionToken, turnId);
      if (!session || !turn) throw new AppError(500, "turn_state_missing", "The retried turn could not be read");
      return { session: publicSession(session), turn: publicTurn(turn), dispatchMode: dispatched.mode };
    } catch {
      await this.store.failTurn(turnId, "turn_retry_failed");
      throw new AppError(503, "turn_retryable", "The retry did not complete. The saved answer remains available until its short retention window ends.", { turnId });
    }
  }

  async getTurn(sessionId: string, sessionToken: string, turnId: string): Promise<PublicTurn> {
    const turn = await this.store.getTurn(sessionId, sessionToken, turnId);
    if (!turn) throw new AppError(404, "turn_not_found", "Turn not found");
    return publicTurn(turn);
  }

  async processWorkflowTurn(input: WorkflowTurnInput): Promise<{ status: "applied" | "duplicate" | "superseded"; turnId: string; sessionRevision: number }> {
    try {
      const completed = await this.processor.process(input);
      return { status: completed.kind, turnId: input.turnId, sessionRevision: input.sessionRevision };
    } catch (error) {
      await this.store.failTurn(input.turnId, error instanceof AppError ? error.code : "workflow_turn_failed");
      throw error;
    }
  }
}
