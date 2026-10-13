// Verify saved claim identities and the real SDK wire body without starting paid tasks.
import test from "node:test";
import assert from "node:assert/strict";
import { RenderWorkflowRunner } from "../../dist/adapters/renderWorkflows.js";
import { attachResearchRunId, beginResearchClaim, failResearchClaim, failResearchClaimByRunId, ResearchSubmissionExpired } from "../../dist/db/researchClaims.js";
import { startVerify } from "../../dist/api/verify.js";
import { config } from "../../dist/config.js";
import { verifyAuditBatch, researchPlatform } from "../../dist/workflows/research.js";

// Model only the claim operations needed by recovery. Conditional updates model
// the database's compare-before-write behavior when requests arrive together.
function claimStore(initial) {
  let row = structuredClone(initial);
  const client = {
    researchClaim: {
      findUnique: async () => structuredClone(row),
      findUniqueOrThrow: async () => structuredClone(row),
      create: async () => { throw new Error("The slug already has a claim"); },
      updateMany: async ({ where, data }) => {
        const matches = Object.entries(where).every(([key, expected]) => {
          if (expected instanceof Date) return row[key].getTime() === expected.getTime();
          if (expected?.in) return expected.in.includes(row[key]);
          return row[key] === expected;
        });
        if (matches) row = { ...row, ...data };
        return { count: Number(matches) };
      },
    },
  };
  return { client, get: () => row };
}

const now = Date.now();
const original = {
  slug: "acme", platform: "Acme Original", runId: "", status: "failed",
  startedAt: new Date(now - 120_000), updatedAt: new Date(now - 1_000),
};

test("uncertain research keeps the saved payload and key across repeated lost replies", async () => {
  const store = claimStore(original);
  const first = await beginResearchClaim({ slug: "acme", platform: "ACME new spelling" }, store.client, now);
  assert.equal(first.kind, "acquired");
  assert.equal(first.claim.platform, original.platform);
  assert.equal(first.claim.startedAt.getTime(), original.startedAt.getTime());
  await failResearchClaim("acme", store.client);
  const second = await beginResearchClaim({ slug: "acme", platform: "another alias" }, store.client, now + 1_000);
  assert.equal(second.claim.platform, first.claim.platform);
  assert.equal(second.claim.startedAt.toISOString(), first.claim.startedAt.toISOString());
});

test("a confirmed failed run permits a deliberate fresh research attempt", async () => {
  const store = claimStore({ ...original, runId: "run-old", status: "pending" });
  await failResearchClaimByRunId("run-old", store.client);
  const next = await beginResearchClaim({ slug: "acme", platform: "Acme Fresh" }, store.client, now);
  assert.equal(next.claim.runId, "");
  assert.equal(next.claim.startedAt.getTime(), now);
  assert.equal(next.claim.platform, "Acme Fresh");
});

test("a known pending run survives cache expiry and a late failed sender", async () => {
  const store = claimStore({ ...original, runId: "run-alive", status: "pending", startedAt: new Date(now - 3_600_000) });
  await failResearchClaim("acme", store.client);
  const result = await beginResearchClaim({ slug: "acme", platform: "Acme" }, store.client, now);
  assert.equal(result.kind, "existing");
  assert.equal(result.claim.runId, "run-alive");
});

test("an unresolved stored submission is not replayed beyond the key retention window", async () => {
  const store = claimStore({ ...original, startedAt: new Date(now - 86_400_000) });
  await assert.rejects(beginResearchClaim({ slug: "acme", platform: "Acme" }, store.client, now), ResearchSubmissionExpired);
});

test("real SDK requests recover one accepted task, while new attempts and tasks stay distinct", async (t) => {
  const requests = [];
  const runs = new Map();
  let dropReply = true;
  // Keep the fake at HTTP, which proves the SDK option becomes a top-level API field.
  t.mock.method(globalThis, "fetch", async (request) => {
    const body = await request.json();
    requests.push(body);
    assert.equal(typeof body.idempotencyKey, "string");
    if (!runs.has(body.idempotencyKey)) runs.set(body.idempotencyKey, `run-${runs.size + 1}`);
    if (dropReply) { dropReply = false; throw new TypeError("Reply lost after acceptance"); }
    return Response.json({ id: runs.get(body.idempotencyKey) });
  });
  const runner = new RenderWorkflowRunner("atlas/research", "fake-token");
  const input = { slug: "acme", platform: "Acme" };
  await assert.rejects(runner.start(input, "saved-attempt-1"));
  assert.deepEqual(await runner.start(input, "saved-attempt-1"), { runId: "run-1" });
  assert.deepEqual(requests[0], requests[1]);
  await runner.start(input, "saved-attempt-2");
  await runner.startNamedTask("atlas/verify", input, "saved-attempt-1");
  assert.equal(runs.size, 3);
});

test("SDK 1.2 parent task receives input separately and chains through its context", async () => {
  const calls = [];
  const ctx = { metadata: {}, run: async (task, input) => {
    calls.push({ name: task.name, input });
    return { outcome: "unchanged", slug: input.slug };
  } };
  const result = await verifyAuditBatch.func(ctx, { slugs: ["acme", "other"], checkOnly: true });
  assert.equal(result.total, 2);
  assert.deepEqual(calls, [
    { name: "verifyPlatformAudit", input: { slug: "acme", checkOnly: true } },
    { name: "verifyPlatformAudit", input: { slug: "other", checkOnly: true } },
  ]);
  // Invalid user input must reach the parser, not be confused with the SDK context.
  await assert.rejects(researchPlatform.func(ctx, null), /input|object/i);
});

// An older sender can finish after another attempt has been saved. Neither its
// success nor failure may overwrite the newer attempt's persistent identity.
test("late responses cannot replace or fail a newer research attempt", async () => {
  const store = claimStore({ ...original, startedAt: new Date(now), status: "claiming" });
  await attachResearchRunId("acme", "old-run", store.client, original.startedAt);
  await failResearchClaim("acme", store.client, original.startedAt);
  assert.equal(store.get().runId, "");
  assert.equal(store.get().status, "claiming");
});

// Administrative verification intentionally keeps only process-local state, but
// repeated requests in that process must still recover the same accepted task.
test("verification reuses its saved key after an unconfirmed start", async (t) => {
  const previousSecret = config.verifyAdminSecret;
  config.verifyAdminSecret = "fake-admin-secret";
  t.after(() => { config.verifyAdminSecret = previousSecret; });
  const attempts = [];
  const runner = { async startNamedTask(task, input, key) {
    attempts.push({ task, input, key });
    if (attempts.length === 1) throw new TypeError("Reply lost");
    return { runId: "verify-recovered" };
  } };
  const store = { getRow: () => ({ slug: "fixture-verify" }) };
  const req = { body: { slug: "fixture-verify", checkOnly: true }, ip: "test", get: () => "Bearer fake-admin-secret" };
  const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } });
  const first = response();
  await startVerify(store, runner)(req, first);
  assert.equal(first.statusCode, 502);
  const second = response();
  await startVerify(store, runner)(req, second);
  assert.equal(second.statusCode, 202);
  assert.ok(attempts[0].key);
  assert.deepEqual(attempts[1], attempts[0]);
});

// A delayed duplicate start reply must not reopen work that polling already finished.
test("late acceptance does not reopen completed or confirmed failed research", async () => {
  for (const status of ["completed", "failed"]) {
    const store = claimStore({ ...original, runId: "accepted-run", status });
    await attachResearchRunId("acme", "accepted-run", store.client, original.startedAt);
    assert.equal(store.get().status, status);
    assert.equal(store.get().runId, "accepted-run");
  }
});
