// @vitest-environment node
// Exercise the real SDK through a fake HTTP boundary. The fake remembers accepted
// requests even when it drops their replies, as a server can do during an outage.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderWorkflowTurnDispatcher } from "./dispatcher.js";
import { createTestService, testConfig } from "./test-runtime.js";

// Restore HTTP after every case so unrelated tests never use this fake server.
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const submissions: Array<{ task: string; input: unknown[]; idempotencyKey: string }> = [];
  const runs = new Map<string, { id: string; status: string }>();
  let loseNextReply = false;
  let timeoutNextReply = false;
  vi.stubGlobal("fetch", async (request: Request) => {
    if (request.method === "GET") {
      const id = new URL(request.url).pathname.split("/").at(-1);
      const run = [...runs.values()].find((entry) => entry.id === id);
      if (!run) throw new Error("Unknown test run");
      return Response.json(run);
    }
    // Inspect the actual SDK request body, not a replacement startTask method.
    const body = await request.json();
    submissions.push(body);
    if (!body.idempotencyKey) throw new Error("Missing native submission key");
    let run = runs.get(body.idempotencyKey);
    if (!run) {
      run = { id: `run-${runs.size + 1}`, status: "running" };
      runs.set(body.idempotencyKey, run);
    }
    if (loseNextReply) {
      loseNextReply = false;
      throw new TypeError("The reply was lost after acceptance");
    }
    if (timeoutNextReply) {
      timeoutNextReply = false;
      await new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
      });
    }
    return Response.json(run);
  });
  const config = {
    ...testConfig,
    executionMode: "render_workflow" as const,
    renderApiKey: "fake-token",
    renderWorkflowTaskSlug: "atlas/diagnosticTurn",
    workflowDispatchTimeoutMs: 20,
  };
  const runtime = createTestService({
    config,
    dispatcher: (_processor, store) => new RenderWorkflowTurnDispatcher(config, store),
  });
  return {
    ...runtime, submissions, runs,
    loseReply: () => { loseNextReply = true; },
    timeoutReply: () => { timeoutNextReply = true; },
  };
}

// Save an answer through the public service so its real persistence and retry
// behavior participate in each test, including keeping the saved turn identifier.
const answer = {
  expectedRevision: 0,
  objectiveId: "D1" as const,
  answer: { kind: "text" as const, text: "Developers stop before starting." },
};

async function submit(runtime: ReturnType<typeof setup>) {
  const session = await runtime.service.createSession({ platformArchetypeIds: [] });
  let turnId: string;
  try {
    const result = await runtime.service.submitTurn(session.session.id, session.sessionToken, randomUUID(), answer);
    turnId = result.turn.id;
  } catch (error) {
    // The failed browser request still identifies the saved answer for recovery.
    turnId = (error as { details: { turnId: string } }).details.turnId;
  }
  return { ...session, turnId };
}

describe("Render turn submission recovery", () => {
  it("recovers an accepted request after its reply is lost and keeps input unchanged", async () => {
    const runtime = setup();
    runtime.loseReply();
    const saved = await submit(runtime);
    const recovered = await runtime.service.retryTurn(saved.session.id, saved.sessionToken, saved.turnId);
    expect(recovered.turn.workflowRunId).toBe("run-1");
    expect(runtime.submissions).toHaveLength(2);
    expect(runtime.submissions[1]).toEqual(runtime.submissions[0]);
    expect(runtime.runs.size).toBe(1);
  });

  it("uses a different submission identity for distinct saved answers", async () => {
    const runtime = setup();
    await submit(runtime);
    await submit(runtime);
    expect(runtime.runs.size).toBe(2);
    expect(runtime.submissions[0].idempotencyKey).not.toBe(runtime.submissions[1].idempotencyKey);
  });

  it("reattaches an active known run instead of submitting another", async () => {
    const runtime = setup();
    const saved = await submit(runtime);
    await runtime.store.failTurn(saved.turnId, "late_dispatch_error");
    await runtime.service.retryTurn(saved.session.id, saved.sessionToken, saved.turnId);
    expect(runtime.submissions).toHaveLength(1);
    expect(runtime.runs.size).toBe(1);
  });

  it.each(["failed", "canceled"])("starts a fresh attempt only after %s, and recovers its lost reply", async (status) => {
    const runtime = setup();
    const saved = await submit(runtime);
    runtime.runs.values().next().value!.status = status;
    await runtime.store.failTurn(saved.turnId, "workflow_turn_failed");
    runtime.loseReply();
    await expect(runtime.service.retryTurn(saved.session.id, saved.sessionToken, saved.turnId)).rejects.toMatchObject({ code: "turn_retryable" });
    const retried = await runtime.service.retryTurn(saved.session.id, saved.sessionToken, saved.turnId);
    expect(retried.turn.workflowRunId).toBe("run-2");
    expect(runtime.runs.size).toBe(2);
    expect(runtime.submissions[1].idempotencyKey).not.toBe(runtime.submissions[0].idempotencyKey);
    expect(runtime.submissions[2]).toEqual(runtime.submissions[1]);
  });

  it("preserves abort support and can recover an accepted timed-out submission", async () => {
    const runtime = setup();
    runtime.timeoutReply();
    const saved = await submit(runtime);
    const recovered = await runtime.service.retryTurn(saved.session.id, saved.sessionToken, saved.turnId);
    expect(recovered.turn.workflowRunId).toBe("run-1");
    expect(runtime.runs.size).toBe(1);
  });
});
