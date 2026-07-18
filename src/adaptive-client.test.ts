import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdaptiveRequestError,
  clearAdaptiveCredential,
  createAdaptiveSession,
  loadAdaptiveCredential,
  retryAdaptiveTurn,
  saveAdaptiveCredential,
  submitAdaptiveTurn,
} from "./adaptive-client";

describe("adaptive client privacy boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAdaptiveCredential();
  });

  it("creates a session with taxonomy context and no identity fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: {
        id: "00000000-0000-4000-8000-000000000001",
        revision: 0,
        status: "active",
        catalogVersion: "test",
        state: { revision: 0, answeredObjectiveIds: [], lastReflection: null, nextQuestion: null, terminalState: null },
        expiresAt: "2026-07-18T00:00:00.000Z",
        pendingTurnId: null,
      },
      sessionToken: "x".repeat(40),
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await createAdaptiveSession({ platformArchetypeIds: ["P04"] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ context: { platformArchetypeIds: ["P04"] } });
    expect(JSON.stringify(body)).not.toContain("name");
    expect(JSON.stringify(body)).not.toContain("company");
  });

  it("submits only the current diagnostic answer and opaque credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: {
        id: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        status: "active",
        catalogVersion: "test",
        state: { revision: 1, answeredObjectiveIds: ["D1"], lastReflection: "Captured.", nextQuestion: null, terminalState: null },
        expiresAt: "2026-07-18T00:00:00.000Z",
        pendingTurnId: null,
      },
      turn: {
        id: "00000000-0000-4000-8000-000000000002",
        revision: 1,
        objectiveId: "D1",
        status: "completed",
        result: null,
        errorCode: null,
        retryable: false,
      },
      dispatchMode: "direct",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await submitAdaptiveTurn({
      credential: { sessionId: "00000000-0000-4000-8000-000000000001", sessionToken: "x".repeat(40), revision: 0, turnIds: {} },
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not attempt the integration" },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not attempt the integration" },
    });
  });

  it("stores only the opaque adaptive credential", () => {
    const credential = {
      sessionId: "00000000-0000-4000-8000-000000000001",
      sessionToken: "x".repeat(40),
      revision: 3,
      turnIds: { D1: "00000000-0000-4000-8000-000000000002" },
      recovery: {
        turnId: "00000000-0000-4000-8000-000000000004",
        objectiveId: "D3" as const,
        action: "retry" as const,
      },
    };
    saveAdaptiveCredential(credential);
    expect(loadAdaptiveCredential()).toEqual(credential);
  });

  it("preserves the saved turn identifier from a retryable server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: "turn_retryable",
        message: "The answer was saved but could not be processed.",
        details: { turnId: "00000000-0000-4000-8000-000000000002" },
      },
    }), { status: 503, headers: { "Content-Type": "application/json" } })));

    const caught = await submitAdaptiveTurn({
      credential: { sessionId: "00000000-0000-4000-8000-000000000001", sessionToken: "x".repeat(40), revision: 0, turnIds: {} },
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not attempt the integration" },
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(AdaptiveRequestError);
    expect(caught).toMatchObject({
      code: "turn_retryable",
      details: { turnId: "00000000-0000-4000-8000-000000000002" },
    });
  });

  it("retries a stored answer without sending the answer again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: {
        id: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        status: "active",
        catalogVersion: "test",
        state: { revision: 1, answeredObjectiveIds: ["D1"], lastReflection: "Captured.", nextQuestion: null, terminalState: null },
        expiresAt: "2026-07-18T00:00:00.000Z",
        pendingTurnId: null,
      },
      turn: {
        id: "00000000-0000-4000-8000-000000000002",
        revision: 1,
        objectiveId: "D1",
        status: "completed",
        result: null,
        errorCode: null,
        retryable: false,
      },
      dispatchMode: "direct",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await retryAdaptiveTurn(
      { sessionId: "00000000-0000-4000-8000-000000000001", sessionToken: "x".repeat(40), revision: 0, turnIds: {} },
      "00000000-0000-4000-8000-000000000002",
    );

    expect(fetchMock.mock.calls[0][0]).toContain("/turns/00000000-0000-4000-8000-000000000002/retry");
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
  });
});
