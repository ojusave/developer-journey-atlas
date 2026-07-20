import test from "node:test";
import assert from "node:assert/strict";

import { runResearch } from "../../dist/core/researchPipeline.js";
import {
  InMemoryDataStore, FakeSearchProvider, FakeLLMProvider, FakeRepoWriter,
} from "../../dist/adapters/fakes.js";
import { selectedPathRow } from "../../lib/measure.mjs";

function draftRecord(overrides = {}) {
  return {
    platform: { name: "Acme", slug: "acme", organization: "Acme Inc" },
    category: "Payments",
    surface: { name: "Quickstart", selection_basis: "single documented route", alternatives_considered: [] },
    research_status: "complete",
    documented_first_success: { normalized_outcome: "First API call returns 200." },
    prerequisites: [],
    primary_path: [
      { step_number: 1, phase: "execute", actor: "developer", interface: "api", action: "Send a request", required: true },
    ],
    friction_gates: [],
    time_to_first_success: { vendor_claim: false, value: "not documented" },
    sources: [{ id: "S1", title: "Docs", url: "https://acme.com/docs" }],
    uncertainties: [],
    ...overrides,
  };
}

function store() {
  return new InMemoryDataStore([
    selectedPathRow(draftRecord({ platform: { name: "Peer", slug: "peer", organization: "Peer" } })),
  ]);
}

async function collect(platform, deps) {
  const events = [];
  await runResearch(platform, deps, (ev) => events.push(ev));
  return events;
}

const hits = [{ title: "Acme Docs", url: "https://acme.com/docs", content: "Getting started" }];

test("happy path yields a draft result and opens a PR", async () => {
  const repo = new FakeRepoWriter({ url: "https://github.com/x/y/pull/9" });
  const deps = {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord()),
    repo,
    store: store(),
    buildRow: selectedPathRow,
  };
  const events = await collect("Acme", deps);
  const types = events.map((e) => e.type);
  assert.ok(types.includes("result"));
  assert.ok(types.includes("pr"));
  assert.equal(repo.calls, 1);
  const result = events.find((e) => e.type === "result");
  assert.equal(result.draft, true);
  assert.equal(result.assessment.name, "Acme");
});

test("search failure yields a typed error and no result", async () => {
  const deps = {
    search: new FakeSearchProvider(new Error("upstream 500")),
    llm: new FakeLLMProvider(draftRecord()),
    store: store(),
    buildRow: selectedPathRow,
  };
  const events = await collect("Acme", deps);
  const err = events.find((e) => e.type === "error");
  assert.equal(err.code, "search_failed");
  assert.ok(!events.some((e) => e.type === "result"));
});

test("no repo configured shows result but skips the PR", async () => {
  const deps = {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord()),
    store: store(),
    buildRow: selectedPathRow,
  };
  const events = await collect("Acme", deps);
  assert.ok(events.some((e) => e.type === "result"));
  const skip = events.find((e) => e.type === "pr_skipped");
  assert.match(skip.reason, /GITHUB_TOKEN/);
});

test("non-complete record is not auto-PR'd", async () => {
  const repo = new FakeRepoWriter();
  const deps = {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord({ research_status: "needs-human-judgment" })),
    repo,
    store: store(),
    buildRow: selectedPathRow,
  };
  const events = await collect("Acme", deps);
  assert.equal(repo.calls, 0);
  assert.ok(events.some((e) => e.type === "pr_skipped"));
});

test("known platform short-circuits to the existing record", async () => {
  const deps = {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord()),
    store: store(),
    buildRow: selectedPathRow,
  };
  const events = await collect("Peer", deps);
  assert.equal(events[0].type, "known");
  assert.equal(events[0].slug, "peer");
});
