import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryDataStore } from "../../dist/adapters/fakes.js";
import {
  buildPeerComparison,
  measureSelectedRoute,
} from "../../dist/core/peerComparison.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const renderGraph = JSON.parse(
  await readFile(path.join(projectRoot, "trust/journey-graphs/render.json"), "utf8"),
);

function row(slug) {
  return {
    name: slug,
    slug,
    category: "Cloud and application runtimes",
    research_status: "reviewed",
    selected_surface: "web",
    route_selection_method: "reviewed",
    boundary_evidence_type: "documented",
    first_success_type: "meaningful_result",
    outcome: "live app",
    raw_transition_count: 0,
    developer_action_count: 0,
    required_developer_action_count: 0,
    optional_developer_action_count: 0,
    platform_event_count: 0,
    documentation_navigation_count: 0,
    wait_or_async_count: 0,
    gate_count: 0,
    heuristic_effort_score: 0,
    comparability_status: "comparable",
  };
}

function fixture(slug, organization, documentationSetKey, freshness = "2026-07-25") {
  const graph = structuredClone(renderGraph);
  graph.platformSlug = slug;
  graph.comparisonBasis.organizationKey = organization.toLowerCase();
  graph.comparisonBasis.documentationSetKey = documentationSetKey;
  graph.comparisonBasis.evidenceFreshnessDate = freshness;
  const record = {
    platform: { name: `${organization} Runtime`, slug, organization },
    category: "Cloud and application runtimes",
  };
  return { graph, record };
}

function storeFor(fixtures) {
  const rows = fixtures.map(({ graph }) => row(graph.platformSlug));
  const records = Object.fromEntries(fixtures.map(({ graph, record }) => [graph.platformSlug, record]));
  const graphs = Object.fromEntries(fixtures.map(({ graph }) => [graph.platformSlug, graph]));
  return new InMemoryDataStore(
    rows,
    records,
    {},
    {},
    {
      count: rows.length,
      generatedAt: "2026-07-25",
      scoreModelVersion: null,
      caveats: [],
      totals: { platforms: rows.length, steps: 0, sources: 0 },
    },
    new Set(rows.map(({ slug }) => slug)),
    graphs,
  );
}

test("selected route measurements count direct graph facts only", () => {
  assert.deepEqual(measureSelectedRoute(renderGraph), {
    requiredActions: 11,
    requiredFields: 9,
    externalGates: 5,
    unavoidableWaits: 1,
  });
});

test("comparison stays unavailable below three distinct qualified peers", () => {
  const subject = fixture("subject", "Subject", "subject-docs");
  const peerOne = fixture("peer-one", "Peer One", "peer-one-docs");
  const duplicateOrganization = fixture("peer-two", "Peer One", "peer-two-docs");
  const stalePeer = fixture("peer-three", "Peer Three", "peer-three-docs", "2025-01-01");
  const comparison = buildPeerComparison(
    storeFor([subject, peerOne, duplicateOrganization, stalePeer]),
    "subject",
    new Date("2026-07-25T12:00:00Z"),
  );
  assert.equal(comparison.available, false);
  assert.equal(comparison.reason, "insufficient_qualified_peers");
  assert.equal(comparison.qualifiedPeerCount, 1);
  assert.equal(comparison.requiredPeerCount, 3);
  assert.equal("peers" in comparison, false);
  assert.equal("dimensions" in comparison, false);
});

test("comparison publishes direct medians and searchable peers at the threshold", () => {
  const fixtures = [
    fixture("subject", "Subject", "subject-docs"),
    fixture("peer-one", "Peer One", "peer-one-docs"),
    fixture("peer-two", "Peer Two", "peer-two-docs"),
    fixture("peer-three", "Peer Three", "peer-three-docs"),
  ];
  const comparison = buildPeerComparison(
    storeFor(fixtures),
    "subject",
    new Date("2026-07-25T12:00:00Z"),
  );
  assert.equal(comparison.available, true);
  assert.equal(comparison.qualifiedPeerCount, 3);
  assert.equal(comparison.peers.length, 3);
  assert.deepEqual(
    comparison.dimensions.map(({ key, subjectValue, peerMedian, position }) => ({
      key,
      subjectValue,
      peerMedian,
      position,
    })),
    [
      { key: "requiredActions", subjectValue: 11, peerMedian: 11, position: "at" },
      { key: "requiredFields", subjectValue: 9, peerMedian: 9, position: "at" },
      { key: "externalGates", subjectValue: 5, peerMedian: 5, position: "at" },
      { key: "unavoidableWaits", subjectValue: 1, peerMedian: 1, position: "at" },
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(comparison),
    /onboardingScore|effortScore|percentile|leaderboard|blockerHypotheses/,
  );
});

test("missing or mismatched comparison evidence fails closed", () => {
  const missing = fixture("missing", "Missing", "missing-docs");
  delete missing.graph.comparisonBasis;
  assert.equal(
    buildPeerComparison(storeFor([missing]), "missing", new Date("2026-07-25T12:00:00Z")).reason,
    "subject_not_comparison_qualified",
  );

  const mismatch = fixture("mismatch", "Mismatch", "mismatch-docs");
  mismatch.graph.comparisonBasis.firstSuccessOutcomeClass = "resource_creation";
  assert.equal(
    buildPeerComparison(storeFor([mismatch]), "mismatch", new Date("2026-07-25T12:00:00Z")).reason,
    "subject_not_comparison_qualified",
  );
});
