import type { DiagnosticCatalog } from "./catalog.js";
import type { TurnEnvelope, TurnResult, WorkflowTurnInput } from "./domain.js";
import { AppError } from "./errors.js";
import type { EnvelopeCipher, SafeLogger } from "./privacy.js";
import type { TurnReasoner } from "./reasoner.js";
import type { CompletedTurn, DiagnosticStore } from "./store.js";
import type { DiagnosticTelemetry } from "./telemetry.js";
import { validateAndApplyProposal } from "./validator.js";

export class TurnProcessor {
  constructor(
    private readonly store: DiagnosticStore,
    private readonly catalog: DiagnosticCatalog,
    private readonly cipher: EnvelopeCipher,
    private readonly reasoner: TurnReasoner,
    private readonly logger: SafeLogger,
    private readonly telemetry: DiagnosticTelemetry,
  ) {}

  async process(input: WorkflowTurnInput): Promise<CompletedTurn> {
    const startedAt = Date.now();
    const claimed = await this.store.claimTurn(input.turnId, input.sessionRevision, input.idempotencyKey);
    if (claimed.kind !== "claimed") {
      this.logger.info({ event: "diagnostic_turn_terminal_replay", turnId: input.turnId, revision: input.sessionRevision, status: claimed.kind });
      return { kind: claimed.kind, session: claimed.session, turn: claimed.turn };
    }
    if (!claimed.turn.encryptedEnvelope) throw new AppError(410, "turn_envelope_missing", "The answer envelope is no longer available");

    const envelope = this.cipher.decrypt<TurnEnvelope>(claimed.turn.encryptedEnvelope);
    if (
      envelope.turnId !== claimed.turn.id
      || envelope.sessionId !== claimed.session.id
      || envelope.revision !== claimed.turn.revision
      || envelope.objectiveId !== claimed.turn.objectiveId
    ) {
      throw new AppError(409, "turn_envelope_mismatch", "The encrypted answer envelope does not match the accepted turn");
    }

    return this.telemetry.traceTurn({
      sessionId: claimed.session.id,
      revision: claimed.turn.revision,
      objectiveId: claimed.turn.objectiveId,
      reasoningMode: this.reasoner.mode,
    }, async (span) => {
      const catalogPacket = this.catalog.packetFor(claimed.session.state, claimed.session.context, claimed.turn.objectiveId);
      const proposal = await this.reasoner.propose({
        state: claimed.session.state,
        envelope,
        catalogPacket,
      });
      const validated = validateAndApplyProposal(
        this.catalog,
        catalogPacket,
        claimed.session.state,
        envelope,
        proposal,
        { trustReflection: this.reasoner.mode === "deterministic" },
      );
      const result: TurnResult = {
        turnId: envelope.turnId,
        revision: envelope.revision,
        reflection: validated.reflection,
        candidates: validated.state.candidates,
        nextQuestion: validated.state.nextQuestion,
        terminalState: validated.state.terminalState,
        reasoningMode: this.reasoner.mode,
        validationWarnings: validated.warnings,
      };
      const completed = await this.store.completeTurn(input.turnId, validated.state, result);
      const latencyMs = Date.now() - startedAt;
      span.complete({
        validationWarningCount: validated.warnings.length,
        candidateCount: validated.state.candidates.length,
        terminalState: validated.state.terminalState,
        latencyMs,
      });
      this.logger.info({
        event: "diagnostic_turn_processed",
        sessionId: claimed.session.id,
        turnId: claimed.turn.id,
        revision: claimed.turn.revision,
        objectiveId: claimed.turn.objectiveId,
        status: completed.kind,
        latencyMs,
      });
      return completed;
    });
  }
}
