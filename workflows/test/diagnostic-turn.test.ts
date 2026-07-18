import assert from "node:assert/strict";
import test from "node:test";

import {
  executeDiagnosticTurn,
  parseDiagnosticTurnInput,
  type DiagnosticTurnInput,
} from "../src/diagnostic-turn.js";

const input: DiagnosticTurnInput = {
  turnId: "019f71fe-d47c-7963-8b86-b59ee39c1ae2",
  sessionRevision: 4,
  idempotencyKey: "119f71fe-d47c-4963-8b86-b59ee39c1ae2",
};

const runtime = {
  baseUrl: "http://first-mile-scanner:10000",
  secret: "a-test-secret-with-more-than-32-characters",
  timeoutMs: 5_000,
};

test("accepts exactly the opaque turn contract", () => {
  assert.deepEqual(parseDiagnosticTurnInput(input), input);
  assert.throws(
    () => parseDiagnosticTurnInput({ ...input, answerText: "participant answer" }),
    /unexpected fields/,
  );
});

test("calls the internal runtime without participant content", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImplementation: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return Response.json({
      turnId: input.turnId,
      sessionRevision: input.sessionRevision,
      status: "applied",
    });
  };

  const result = await executeDiagnosticTurn(input, runtime, fetchImplementation);

  assert.equal(capturedUrl, "http://first-mile-scanner:10000/internal/workflow/turn");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), input);
  assert.equal(
    new Headers(capturedInit?.headers).get("authorization"),
    `Bearer ${runtime.secret}`,
  );
  assert.deepEqual(result, {
    turnId: input.turnId,
    sessionRevision: input.sessionRevision,
    status: "applied",
  });
});

test("rejects a result for a different session revision", async () => {
  const fetchImplementation: typeof fetch = async () =>
    Response.json({ turnId: input.turnId, sessionRevision: 5, status: "applied" });

  await assert.rejects(
    executeDiagnosticTurn(input, runtime, fetchImplementation),
    /does not match the requested turn/,
  );
});

test("reports only the HTTP status when the runtime fails", async () => {
  const fetchImplementation: typeof fetch = async () =>
    new Response("sensitive server error body", { status: 503 });

  await assert.rejects(
    executeDiagnosticTurn(input, runtime, fetchImplementation),
    (error: Error) => {
      assert.equal(error.message, "Diagnostic runtime request failed with HTTP 503.");
      assert.doesNotMatch(error.message, /sensitive server error body/);
      return true;
    },
  );
});
