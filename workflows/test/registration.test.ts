// Exercise the exported task definition so an SDK argument-order change cannot
// silently turn the execution context into the saved diagnostic answer.
import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticTurn } from "../src/index.js";

test("registered diagnostic task forwards its input after the SDK context", async (t) => {
  const previousBaseUrl = process.env.SCANNER_INTERNAL_BASE_URL;
  const previousSecret = process.env.INTERNAL_WORKFLOW_SECRET;
  process.env.SCANNER_INTERNAL_BASE_URL = "http://atlas.example.test";
  process.env.INTERNAL_WORKFLOW_SECRET = "fake-internal-secret-with-more-than-32-characters";
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.SCANNER_INTERNAL_BASE_URL;
    else process.env.SCANNER_INTERNAL_BASE_URL = previousBaseUrl;
    if (previousSecret === undefined) delete process.env.INTERNAL_WORKFLOW_SECRET;
    else process.env.INTERNAL_WORKFLOW_SECRET = previousSecret;
  });
  const input = {
    turnId: "019f71fe-d47c-7963-8b86-b59ee39c1ae2",
    sessionRevision: 4,
    // A fixed, visibly artificial request ID is enough for this local test.
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  };
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.deepEqual(JSON.parse(String(init.body)), input);
    return Response.json({ ...input, status: "applied" });
  });
  const result = await diagnosticTurn.func({ metadata: {}, run: async () => { throw new Error("No child task expected"); } }, input);
  assert.equal(result.status, "applied");
  assert.equal(result.turnId, input.turnId);
});
