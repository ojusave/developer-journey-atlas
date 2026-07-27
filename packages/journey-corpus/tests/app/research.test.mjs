import test from "node:test";
import assert from "node:assert/strict";

import {
  runResearchPipeline,
  stepsFromAdapters,
  slugify,
  validateSourceGrounding,
} from "../../dist/core/researchPipeline.js";
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
    journey_graph: {
      schemaVersion: "1.0",
      platformSlug: "acme",
      startingState: {
        boundary: "account_creation",
        assumptions: [],
        availableInputs: ["api_endpoint"],
      },
      prerequisites: [],
      nodes: [
        {
          id: "send-request",
          kind: "developer_action",
          phase: "execute",
          actor: "developer",
          interface: "api",
          action: "Send a request.",
          required: true,
          requiredFields: [],
          inputs: ["api_endpoint"],
          outputs: ["api_response"],
          successSignal: "The API returns a response.",
          evidence: [{ sourceId: "S1", locator: "Quickstart request" }],
          requiresFieldInventory: false,
        },
        {
          id: "first-success",
          kind: "terminal_outcome",
          phase: "verify",
          actor: "platform",
          interface: "api",
          action: "The first API call succeeds.",
          required: true,
          requiredFields: [],
          inputs: ["api_response"],
          outputs: [],
          successSignal: "The response status is 200.",
          evidence: [{ sourceId: "S1", locator: "Quickstart response" }],
          requiresFieldInventory: false,
        },
      ],
      edges: [{
        from: "send-request",
        to: "first-success",
        evidence: [{ sourceId: "S1", locator: "Quickstart request and response" }],
      }],
      externalGates: [],
      candidateRoutes: [{
        id: "hosted-api",
        status: "selected",
        nodeIds: ["send-request", "first-success"],
        selectionBasis: "Use the documented hosted API route.",
        condition: "The developer uses the hosted API.",
        routeSummary: "Send the documented API request.",
        effectOnFirstSuccess: "The API returns a successful response.",
        reasonNotSelected: null,
        branchAtNodeId: null,
        evidence: [{ sourceId: "S1", locator: "Quickstart hosted API route" }],
      }],
      uncertainties: [],
      firstSuccessBoundary: {
        nodeId: "first-success",
        outcomeClass: "meaningful_result",
        officialRouteContinues: false,
        evidence: [{ sourceId: "S1", locator: "Quickstart response status" }],
      },
      selectedRoute: {
        id: "hosted-api",
        nodeIds: ["send-request", "first-success"],
        policy: "Use the documented hosted API route.",
        unresolvedReason: null,
      },
    },
    ...overrides,
  };
}

function store() {
  return new InMemoryDataStore([
    selectedPathRow(draftRecord({ platform: { name: "Peer", slug: "peer", organization: "Peer" } })),
  ]);
}

function ctx() {
  return {
    store: store(),
    buildRow: selectedPathRow,
    identities: [{
      slug: "acme",
      canonicalName: "Acme",
      organization: "Acme Inc",
      aliases: [],
      officialRootDomain: "acme.com",
      documentationDomains: ["acme.com"],
      applicationDomains: [],
      approvedGithubOrganizations: [],
    }],
  };
}

function inputFor(platform) {
  return { platform, slug: slugify(platform) };
}

async function run(platform, deps, context = ctx()) {
  return runResearchPipeline(inputFor(platform), stepsFromAdapters(deps), context);
}

const hits = [{
  title: "Acme Docs",
  url: "https://acme.com/docs",
  content: "Quickstart hosted API route. Quickstart request and response. Quickstart response status is 200.",
  metadata: {
    canonicalUrl: "https://acme.com/docs",
    redirectChain: [],
    httpStatus: 200,
    contentType: "text/html",
    retrievedAt: "2026-07-25T00:00:00Z",
    contentPresent: true,
    contentHash: "abc123",
    contentTruncated: false,
    retrievedContentChars: 94,
    visibleTitle: "Acme Docs",
    discoveredLinks: [],
  },
}];

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

test("no official docs yields a no_official_source terminal", async () => {
  const outcome = await run("Acme", {
    search: new FakeSearchProvider([]),
    llm: new FakeLLMProvider(draftRecord()),
  });
  assert.equal(outcome.outcome, "no_official_source");
});

test("unusable official pages do not poison usable official docs", async () => {
  let docsSeenByModel = [];
  const unusable = {
    ...hits[0],
    title: "Blocked help page",
    url: "https://acme.com/help",
    metadata: {
      ...hits[0].metadata,
      canonicalUrl: "https://acme.com/help",
      httpStatus: 403,
      contentPresent: false,
      contentHash: null,
    },
  };
  const outcome = await run("Acme", {
    search: new FakeSearchProvider([unusable, ...hits]),
    llm: {
      reconstructRecord: async (_platform, docs) => {
        docsSeenByModel = docs;
        return draftRecord();
      },
    },
  });
  assert.equal(outcome.outcome, "completed");
  assert.deepEqual(docsSeenByModel.map((doc) => doc.url), ["https://acme.com/docs"]);
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
  assert.equal(outcome.outcome, "claim_grounding_failed");
  assert.equal(repo.calls, 0);
});

test("graph evidence IDs must resolve to accepted record sources", async () => {
  const record = draftRecord();
  record.journey_graph.nodes[0].evidence[0].sourceId = "INVENTED";
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(record),
  });
  assert.equal(outcome.outcome, "claim_grounding_failed");
  assert.match(outcome.message, /graph evidence reference/);
});

test("a private draft can display before literal locators pass publication review", async () => {
  const record = draftRecord();
  record.journey_graph.nodes[0].evidence[0].locator = "Section beyond retrieval limit";
  assert.match(
    validateSourceGrounding(record, hits),
    /did not occur in the retrieved content/,
  );
  const outcome = await run("Acme", {
    search: new FakeSearchProvider(hits),
    llm: new FakeLLMProvider(record),
  });
  assert.equal(outcome.outcome, "completed");
});

test("ambiguous Apollo identity stops before discovery", async () => {
  const context = ctx();
  context.identities = [
    { ...context.identities[0], slug: "apollo-io", canonicalName: "Apollo.io", aliases: ["Apollo"] },
    { ...context.identities[0], slug: "apollo-graphql", canonicalName: "Apollo GraphQL", aliases: ["Apollo"] },
  ];
  let searchCalls = 0;
  const outcome = await run("Apollo", {
    search: { findOfficialDocs: async () => { searchCalls += 1; return hits; } },
    llm: new FakeLLMProvider(draftRecord()),
  }, context);
  assert.equal(outcome.outcome, "identity_ambiguous");
  assert.equal(outcome.candidates.length, 2);
  assert.equal(searchCalls, 0);
});

test("third-party DataCamp evidence is rejected before reconstruction", async () => {
  let modelCalls = 0;
  const outcome = await run("Acme", {
    search: new FakeSearchProvider([{
      ...hits[0],
      title: "DataCamp tutorial",
      url: "https://datacamp.com/tutorial/acme",
      metadata: { ...hits[0].metadata, canonicalUrl: "https://datacamp.com/tutorial/acme" },
    }]),
    llm: {
      reconstructRecord: async () => {
        modelCalls += 1;
        return draftRecord();
      },
    },
  });
  assert.equal(outcome.outcome, "official_source_unusable");
  assert.equal(modelCalls, 0);
});
