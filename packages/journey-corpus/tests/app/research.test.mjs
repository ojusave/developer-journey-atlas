import test from "node:test";
import assert from "node:assert/strict";

import { runResearchPipeline, stepsFromAdapters, slugify } from "../../dist/core/researchPipeline.js";
import {
  InMemoryDataStore, FakeSearchProvider, FakeLLMProvider, FakeRepoWriter,
} from "../../dist/adapters/fakes.js";
import { SchemaRepairError } from "../../dist/adapters/openRouter.js";
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

function ctx() {
  return { store: store(), buildRow: selectedPathRow };
}

function inputFor(platform) {
  return { platform, slug: slugify(platform) };
}

async function run(platform, deps, context = ctx()) {
  return runResearchPipeline(inputFor(platform), stepsFromAdapters(deps), context);
}

const hits = [{ title: "Acme Docs", url: "https://acme.com/docs", content: "Getting started" }];

test("happy path yields a completed outcome without opening a GitHub contribution", async () => {
  const repo = new FakeRepoWriter({ url: "https://github.com/x/y/pull/9" });
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord()),
    repo,
  });
  assert.equal(outcome.outcome, "completed");
  assert.equal(outcome.assessment.name, "Acme");
  assert.equal(outcome.contribution.status, "skipped");
  assert.equal(repo.calls, 0);
});

test("transient search failure yields search_failed and no result", async () => {
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(new Error("upstream 500")),
    llm: new FakeLLMProvider(draftRecord()),
  });
  assert.equal(outcome.outcome, "search_failed");
});

test("no docs yields a no_docs terminal", async () => {
  const outcome = await run("Acme", {
    search: new FakeSearchProvider([]),
    llm: new FakeLLMProvider(draftRecord()),
  });
  assert.equal(outcome.outcome, "no_docs");
});

test("transient model failure yields model_failed (retryable class, not terminal input error)", async () => {
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(new Error("openrouter 502")),
  });
  assert.equal(outcome.outcome, "model_failed");
});

test("schema-repair exhaustion yields invalid_output (deterministic, not retried)", async () => {
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(new SchemaRepairError("missing required field")),
  });
  assert.equal(outcome.outcome, "invalid_output");
});

test("research completes without a repo writer", async () => {
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord()),
  });
  assert.equal(outcome.outcome, "completed");
  assert.equal(outcome.contribution.status, "skipped");
});

test("known platform short-circuits to the existing record", async () => {
  const outcome = await run("Peer", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord()),
  });
  assert.equal(outcome.outcome, "known");
  assert.equal(outcome.slug, "peer");
});

test("drafts cannot cite URLs that were not returned by the docs search", async () => {
  const repo = new FakeRepoWriter();
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(draftRecord({ sources: [{ id: "S1", title: "Invented", url: "https://invented.example/docs" }] })),
    repo,
  });
  assert.equal(outcome.outcome, "source_grounding_failed");
  assert.equal(repo.calls, 0);
});
