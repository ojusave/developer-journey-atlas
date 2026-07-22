import test from "node:test";
import assert from "node:assert/strict";

import { buildResearchInput, parseResearchTaskInput, InvalidResearchInput } from "../../dist/workflows/input.js";
import { reconstructWithClassification, draftWithClassification } from "../../dist/workflows/classify.js";
import { SchemaRepairError, normalizeFrictionGateTypes } from "../../dist/adapters/openRouter.js";
import { GitHubApiError, GitHubPrWriter } from "../../dist/adapters/githubPr.js";
import { projectRun, coerceOutcome } from "../../dist/adapters/renderWorkflows.js";
import { startResearch, getResearchStatus } from "../../dist/api/research.js";
import { InMemoryDataStore, FakeWorkflowRunner } from "../../dist/adapters/fakes.js";
import { selectedPathRow } from "../../lib/measure.mjs";

/* ---------- Draft normalization ---------- */

test("normalizeFrictionGateTypes maps aliases and unknown values onto the schema enum", () => {
  const normalized = normalizeFrictionGateTypes({
    friction_gates: [
      { type: "Account", description: "signup" },
      { type: "external gate", description: "vendor review" },
      { type: "totally-made-up", description: "x" },
    ],
  });
  assert.deepEqual(
    normalized.friction_gates.map((g) => g.type),
    ["account", "other", "other"],
  );
});

/* ---------- Task input validation ---------- */

test("buildResearchInput normalizes and slugifies", () => {
  const input = buildResearchInput("  Acme Payments  ");
  assert.equal(input.platform, "Acme Payments");
  assert.equal(input.slug, "acme-payments");
});

test("buildResearchInput rejects empty and oversized names", () => {
  assert.throws(() => buildResearchInput(""), InvalidResearchInput);
  assert.throws(() => buildResearchInput("x".repeat(101)), InvalidResearchInput);
});

test("parseResearchTaskInput rejects unexpected fields and bad slugs", () => {
  assert.throws(() => parseResearchTaskInput({ platform: "Acme", slug: "acme", extra: 1 }), InvalidResearchInput);
  assert.throws(() => parseResearchTaskInput({ platform: "Acme", slug: "Not A Slug" }), InvalidResearchInput);
  assert.throws(() => parseResearchTaskInput("nope"), InvalidResearchInput);
  const ok = parseResearchTaskInput({ platform: "Acme", slug: "acme" });
  assert.deepEqual(ok, { platform: "Acme", slug: "acme" });
});

/* ---------- Retry classification ---------- */

test("reconstruct classification: schema-repair is terminal, other errors are transient", async () => {
  const record = { platform: { name: "A", slug: "a", organization: "A" }, research_status: "complete" };
  const ok = await reconstructWithClassification({ reconstructRecord: async () => record }, "A", []);
  assert.equal(ok.status, "ok");

  const invalid = await reconstructWithClassification(
    { reconstructRecord: async () => { throw new SchemaRepairError("bad"); } }, "A", [],
  );
  assert.equal(invalid.status, "invalid_output");

  await assert.rejects(
    reconstructWithClassification({ reconstructRecord: async () => { throw new Error("502"); } }, "A", []),
    /502/,
  );
});

test("draft classification: transient GitHub errors rethrow, permanent become skipped", async () => {
  const record = { platform: { name: "A", slug: "a", organization: "A" } };

  const opened = await draftWithClassification(
    { openDraftRecordPR: async () => ({ url: "https://gh/pr/1", reused: false }) }, record,
  );
  assert.equal(opened.status, "opened");

  const skippedNoRepo = await draftWithClassification(undefined, record);
  assert.equal(skippedNoRepo.status, "skipped");

  const permanent = await draftWithClassification(
    { openDraftRecordPR: async () => { throw new GitHubApiError("forbidden", 403, false); } }, record,
  );
  assert.equal(permanent.status, "skipped");

  await assert.rejects(
    draftWithClassification({ openDraftRecordPR: async () => { throw new GitHubApiError("boom", 503, true); } }, record),
    GitHubApiError,
  );
});

/* ---------- Status projection ---------- */

test("projectRun maps run statuses to safe phases", () => {
  assert.equal(projectRun("r", { status: "pending", retries: 0 }).phase, "queued");
  assert.equal(projectRun("r", { status: "pending", retries: 1 }).phase, "retrying");
  assert.equal(projectRun("r", { status: "running", retries: 0 }).phase, "running");
  assert.equal(projectRun("r", { status: "running", retries: 2 }).phase, "retrying");

  const failed = projectRun("r", { status: "failed" });
  assert.equal(failed.phase, "failed");
  assert.equal(failed.result, null);
  assert.ok(failed.message && !/stack|api|token/i.test(failed.message));

  const completed = projectRun("r", { status: "succeeded", results: [{ outcome: "no_docs" }] });
  assert.equal(completed.phase, "completed");
  assert.equal(completed.result.outcome, "no_docs");

  const garbage = projectRun("r", { status: "succeeded", results: [{ nope: true }] });
  assert.equal(garbage.phase, "failed");
});

test("coerceOutcome rejects unknown shapes", () => {
  assert.equal(coerceOutcome({ outcome: "completed" }).outcome, "completed");
  assert.equal(coerceOutcome({ outcome: "banana" }), null);
  assert.equal(coerceOutcome("nope"), null);
});

/* ---------- GitHub idempotency ---------- */

function fetchMock(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? "GET" });
    for (const route of routes) {
      if (route.match(url, opts)) return route.respond(url, opts);
    }
    return { status: 404, json: async () => ({}) };
  };
  impl.calls = calls;
  return impl;
}

test("openDraftRecordPR reuses an already-open PR and never creates a second", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = fetchMock([
    {
      match: (url) => url.includes("/pulls?state=open"),
      respond: async () => ({ status: 200, json: async () => [{ html_url: "https://github.com/o/r/pull/42" }] }),
    },
  ]);
  try {
    const writer = new GitHubPrWriter("token", "o/r");
    const result = await writer.openDraftRecordPR({ platform: { name: "Acme", slug: "acme" }, category: "x", research_status: "complete" });
    assert.equal(result.reused, true);
    assert.equal(result.url, "https://github.com/o/r/pull/42");
    assert.ok(!globalThis.fetch.calls.some((c) => c.method === "POST" && c.url.includes("/pulls")));
    assert.ok(!globalThis.fetch.calls.some((c) => c.url.includes("/git/refs")));
  } finally {
    globalThis.fetch = original;
  }
});

test("openDraftRecordPR creates a deterministic branch and one PR when none exists", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = fetchMock([
    { match: (url) => url.includes("/pulls?state=open"), respond: async () => ({ status: 200, json: async () => [] }) },
    { match: (url) => url.includes("/git/ref/heads/main"), respond: async () => ({ status: 200, json: async () => ({ object: { sha: "base" } }) }) },
    { match: (url, o) => url.endsWith("/git/refs") && o.method === "POST", respond: async () => ({ status: 201, json: async () => ({}) }) },
    { match: (url) => url.includes("/contents/") && url.includes("?ref="), respond: async () => ({ status: 404, json: async () => ({}) }) },
    { match: (url, o) => url.includes("/contents/") && o.method === "PUT", respond: async () => ({ status: 201, json: async () => ({}) }) },
    { match: (url, o) => url.endsWith("/pulls") && o.method === "POST", respond: async () => ({ status: 201, json: async () => ({ html_url: "https://github.com/o/r/pull/7" }) }) },
  ]);
  try {
    const writer = new GitHubPrWriter("token", "o/r");
    const result = await writer.openDraftRecordPR({ platform: { name: "Acme", slug: "acme" }, category: "x", research_status: "complete" });
    assert.equal(result.reused, false);
    assert.equal(result.url, "https://github.com/o/r/pull/7");
    const branchCall = globalThis.fetch.calls.find((c) => c.url.endsWith("/git/refs") && c.method === "POST");
    assert.ok(branchCall, "creates the branch");
    const pulls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/pulls") && c.method === "POST");
    assert.equal(pulls.length, 1, "opens exactly one PR");
  } finally {
    globalThis.fetch = original;
  }
});

/* ---------- Web API start/status boundary ---------- */

function fakeReq({ body = {}, ip = "1.2.3.4", params = {} } = {}) {
  return { body, ip, params };
}
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader() {},
  };
}

function storeWithPeer() {
  return new InMemoryDataStore([
    selectedPathRow({
      platform: { name: "Known", slug: "known", organization: "Known" },
      category: "Payments",
      research_status: "complete",
      primary_path: [{ step_number: 1, action: "x", required: true }],
      sources: [{ id: "S1", title: "d", url: "https://k/docs" }],
    }),
  ]);
}

test("start returns 503 when no runner is configured", async () => {
  const res = fakeRes();
  await startResearch(storeWithPeer(), null)(fakeReq({ body: { platform: "New" } }), res);
  assert.equal(res.statusCode, 503);
});

test("start short-circuits known platforms without touching the workflow", async () => {
  const runner = new FakeWorkflowRunner();
  const res = fakeRes();
  await startResearch(storeWithPeer(), runner)(fakeReq({ body: { platform: "Known" } }), res);
  assert.equal(res.body.data.known, true);
  assert.equal(runner.started.length, 0);
});

test("start rejects invalid platform names", async () => {
  const res = fakeRes();
  await startResearch(storeWithPeer(), new FakeWorkflowRunner())(fakeReq({ body: { platform: "" } }), res);
  assert.equal(res.statusCode, 400);
});

test("start begins a run and returns 202 with a run id", async () => {
  const runner = new FakeWorkflowRunner("run-123");
  const res = fakeRes();
  await startResearch(storeWithPeer(), runner)(fakeReq({ body: { platform: "Brand New Co" } }), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.data.runId, "run-123");
  assert.equal(runner.started[0].slug, "brand-new-co");
});

test("status returns only a safe projection and never the raw input", async () => {
  const runner = new FakeWorkflowRunner("r", [
    { runId: "r", phase: "completed", result: { outcome: "no_docs" }, message: null },
  ]);
  const res = fakeRes();
  await getResearchStatus(runner)(fakeReq({ params: { runId: "r" } }), res);
  assert.deepEqual(Object.keys(res.body.data).sort(), ["message", "phase", "result", "runId"]);
  assert.equal(res.body.data.result.outcome, "no_docs");
});

test("status maps a runner error to a safe 404", async () => {
  const runner = { status: async () => { throw new Error("secret api detail"); } };
  const res = fakeRes();
  await getResearchStatus(runner)(fakeReq({ params: { runId: "r" } }), res);
  assert.equal(res.statusCode, 404);
  assert.ok(!/secret/i.test(JSON.stringify(res.body)));
});

test("status rejects malformed run ids", async () => {
  const res = fakeRes();
  await getResearchStatus(new FakeWorkflowRunner())(fakeReq({ params: { runId: "bad id!!" } }), res);
  assert.equal(res.statusCode, 400);
});
