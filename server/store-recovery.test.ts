// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestService } from "./test-runtime.js";

describe("turn recovery invariants", () => {
  it("releases a session when an accepted answer envelope expires before processing", async () => {
    const { service, store } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    const turnId = randomUUID();
    await store.acceptTurn({
      id: turnId,
      sessionId: created.session.id,
      tokenHash: created.sessionToken,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
      inputHash: "opaque-test-hash",
      objectiveId: "D1",
      correctionOfTurnId: null,
      encryptedEnvelope: { version: 1, keyVersion: "v1", iv: "AA==", tag: "AA==", ciphertext: "AA==" },
      envelopeExpiresAt: new Date(Date.now() - 1_000),
    });

    const purge = await store.purgeExpired();
    const session = await service.getSession(created.session.id, created.sessionToken);
    const turn = await service.getTurn(created.session.id, created.sessionToken, turnId);
    expect(purge.envelopesCleared).toBe(1);
    expect(session.status).toBe("active");
    expect(session.pendingTurnId).toBeNull();
    expect(turn.status).toBe("failed");
    expect(turn.retryable).toBe(false);
    expect(turn.errorCode).toBe("turn_envelope_expired");
  });

  it("does not regress a completed turn when a late dispatcher error arrives", async () => {
    const { service, store } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    const response = await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not begin the documented evaluation path." },
    });
    expect(response.turn.status).toBe("completed");

    await store.failTurn(response.turn.id, "late_dispatch_error");
    const turn = await service.getTurn(created.session.id, created.sessionToken, response.turn.id);
    const session = await service.getSession(created.session.id, created.sessionToken);
    expect(turn.status).toBe("completed");
    expect(turn.errorCode).toBeNull();
    expect(session.state.answeredObjectiveIds).toContain("D1");
  });
});
