// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors.js";
import { DeterministicReasoner, type ReasoningInput, type TurnProposal, type TurnReasoner } from "./reasoner.js";
import { createTestService } from "./test-runtime.js";

describe("DiagnosticService", () => {
  it("accepts, processes, and replays an idempotent turn", async () => {
    const { service } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    const idempotencyKey = randomUUID();
    const input = {
      expectedRevision: 0,
      objectiveId: "D1" as const,
      answer: { kind: "text" as const, text: "Developers do not begin an integration." },
    };

    const first = await service.submitTurn(created.session.id, created.sessionToken, idempotencyKey, input);
    expect(first.dispatchMode).toBe("direct");
    expect(first.turn.status).toBe("completed");
    expect(first.session.revision).toBe(1);
    expect(first.session.state.nextQuestion?.objectiveId).toBe("D3");
    expect(first.turn.result?.reasoningMode).toBe("deterministic");

    const replay = await service.submitTurn(created.session.id, created.sessionToken, idempotencyKey, input);
    expect(replay.dispatchMode).toBe("replay");
    expect(replay.turn.id).toBe(first.turn.id);
    expect(replay.session.revision).toBe(1);

    const workflowReplay = await service.processWorkflowTurn({
      turnId: first.turn.id,
      sessionRevision: first.turn.revision,
      idempotencyKey,
    });
    expect(workflowReplay.status).toBe("duplicate");
  });

  it("rejects idempotency conflicts and stale revisions", async () => {
    const { service } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    const idempotencyKey = randomUUID();
    await service.submitTurn(created.session.id, created.sessionToken, idempotencyKey, {
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers stop before setup." },
    });

    await expect(service.submitTurn(created.session.id, created.sessionToken, idempotencyKey, {
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: "This is different input." },
    })).rejects.toMatchObject({ code: "idempotency_conflict", statusCode: 409 });

    await expect(service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: "A stale answer." },
    })).rejects.toMatchObject({ code: "stale_revision", statusCode: 409 });
  });

  it("retracts a corrected answer without mutating the accepted history", async () => {
    const { service } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    const original = await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers are not adopting." },
    });
    const corrected = await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: 1,
      objectiveId: "D1",
      correctionOfTurnId: original.turn.id,
      answer: { kind: "text", text: "We only know dashboard usage is zero." },
    });

    expect(corrected.session.revision).toBe(2);
    expect(corrected.session.state.acceptedTurnIds).toEqual([original.turn.id, corrected.turn.id]);
    expect(corrected.session.state.retractedTurnIds).toEqual([original.turn.id]);
    expect(corrected.session.state.nextQuestion?.objectiveId).toBe("D3");
  });

  it("reopens a completed diagnostic when an early answer is corrected", async () => {
    const { service } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    const objectiveIds = ["D1", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"] as const;
    const answersByObjective: Record<(typeof objectiveIds)[number], string> = {
      D1: "Developers stop before beginning an integration.",
      D3: "Developer: application developers\nJob: receive business events in their service",
      D4: "A representative business event reaches their endpoint.",
      D5: "No attempt observed",
      D6: "Dashboard shows no attempted integration.",
      D7: "Current explanation: the work may not be urgent\nEvidence types: direct observation",
      D8: "The planned but delayed path was observed.",
      D9: "Developer relations can interview one developer this week.",
      D10: "Gather better evidence\nMove: observe one intended developer\nExpected signal: the earliest unresolved transition becomes visible",
    };
    const turns = [];
    let revision = 0;
    for (const objectiveId of objectiveIds) {
      const response = await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
        expectedRevision: revision,
        objectiveId,
        answer: { kind: "text", text: answersByObjective[objectiveId] },
      });
      turns.push(response.turn);
      revision = response.session.revision;
    }
    const complete = await service.getSession(created.session.id, created.sessionToken);
    expect(complete.status).toBe("complete");

    const corrected = await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: revision,
      objectiveId: "D1",
      correctionOfTurnId: turns[0].id,
      answer: { kind: "text", text: "The concern is pre-attempt, not delivery reliability." },
    });

    expect(corrected.session.status).toBe("active");
    expect(corrected.session.state.answeredObjectiveIds).toEqual(["D1"]);
    expect(corrected.session.state.nextQuestion?.objectiveId).toBe("D3");
    expect(corrected.session.state.retractedTurnIds).toEqual(turns.map((turn) => turn.id));
  });

  it("does not reveal a session to the wrong credential", async () => {
    const { service } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    await expect(service.getSession(created.session.id, "wrong-token-that-is-long-enough-to-test"))
      .rejects.toBeInstanceOf(AppError);
  });

  it("keeps a failed answer retryable without asking the participant to re-enter it", async () => {
    class FailOnceReasoner implements TurnReasoner {
      readonly mode = "deterministic" as const;
      private calls = 0;
      private readonly fallback = new DeterministicReasoner();

      async propose(input: ReasoningInput): Promise<TurnProposal> {
        this.calls += 1;
        if (this.calls === 1) throw new Error("transient failure");
        return this.fallback.propose(input);
      }
    }

    const { service } = createTestService({ reasoner: new FailOnceReasoner() });
    const created = await service.createSession({ platformArchetypeIds: [] });
    let failedTurnId = "";
    try {
      await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
        expectedRevision: 0,
        objectiveId: "D1",
        answer: { kind: "text", text: "Developers do not begin." },
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "turn_retryable", statusCode: 503 });
      failedTurnId = (error as AppError).details && typeof (error as AppError).details === "object"
        ? String(((error as AppError).details as { turnId: string }).turnId)
        : "";
    }
    expect(failedTurnId).toMatch(/^[0-9a-f-]{36}$/);

    const retried = await service.retryTurn(created.session.id, created.sessionToken, failedTurnId);
    expect(retried.turn.status).toBe("completed");
    expect(retried.session.revision).toBe(1);
    expect(retried.session.state.nextQuestion?.objectiveId).toBe("D3");
  });

  it.each(["this is boring", "this is really boring"])("offers a short exit instead of treating irritation as case evidence: %s", async (text) => {
    const { service } = createTestService();
    const created = await service.createSession({ platformArchetypeIds: [] });
    const interruption = await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text },
    });
    expect(interruption.session.state.nextQuestion?.objectiveId).toBe("D1");
    expect(interruption.session.state.nextQuestion?.options.map((option) => option.id)).toContain("conversation_finish");
    expect(interruption.turn.result?.reflection).toContain("shorten");

    const finished = await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: 1,
      objectiveId: "D1",
      answer: { kind: "single_choice", optionIds: ["conversation_finish"], text: "Finish with what we have" },
    });
    expect(finished.session.status).toBe("complete");
    expect(finished.session.state.terminalState).toBe("user_declines");
  });
});
