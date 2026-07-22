import test from "node:test";
import assert from "node:assert/strict";
import { buildCurvePlacement, percentileRank } from "../../dist/core/curvePlacement.js";
import { InMemoryDataStore } from "../../dist/adapters/fakes.js";

function row(slug, category, overrides = {}) {
  return {
    name: slug,
    slug,
    category,
    research_status: "complete",
    selected_surface: "HTTP API",
    route_selection_method: "documented-default",
    boundary_evidence_type: "explicitly-named",
    first_success_type: "first API/SDK call",
    outcome: "Done",
    raw_transition_count: 4,
    developer_action_count: 4,
    required_developer_action_count: 4,
    optional_developer_action_count: 0,
    platform_event_count: 0,
    documentation_navigation_count: 0,
    wait_or_async_count: 0,
    gate_count: 1,
    heuristic_effort_score: 9,
    comparability_status: "comparable",
    ...overrides,
  };
}

function record(slug, steps, gates) {
  return {
    platform: { name: slug, slug, organization: slug },
    category: "Communications, media, and social",
    primary_path: Array.from({ length: steps }, (_, i) => ({
      step_number: i + 1,
      action: `Step ${i + 1}`,
      required: true,
    })),
    friction_gates: Array.from({ length: gates }, (_, i) => ({
      at_step: i + 1,
      type: i === 0 ? "wait" : "account",
      description: `Gate ${i + 1}`,
    })),
  };
}

test("percentileRank is mid for median value", () => {
  assert.equal(percentileRank(5, [1, 5, 9]), 50);
});

test("draft curve places a platform vs corpus and category; verified stays unavailable", () => {
  const rows = [
    row("alpha", "Communications, media, and social"),
    row("beta", "Communications, media, and social"),
    row("gamma", "Communications, media, and social"),
    row("delta", "Communications, media, and social"),
    row("other", "Cloud and application runtimes"),
    row("other2", "Cloud and application runtimes"),
    row("other3", "Cloud and application runtimes"),
    row("other4", "Cloud and application runtimes"),
  ];
  const records = {
    alpha: record("alpha", 18, 6),
    beta: record("beta", 10, 2),
    gamma: record("gamma", 12, 3),
    delta: record("delta", 8, 1),
    other: record("other", 20, 4),
    other2: record("other2", 14, 2),
    other3: record("other3", 11, 2),
    other4: record("other4", 9, 1),
  };
  const store = new InMemoryDataStore(rows, records);
  const curve = buildCurvePlacement(rows[0], store);

  assert.equal(curve.verified.available, false);
  assert.equal(curve.verified.category.available, false);
  assert.match(curve.note, /OpenRouter/);

  assert.equal(curve.draftDocumented.available, true);
  assert.equal(curve.draftDocumented.corpus.available, true);
  assert.equal(curve.draftDocumented.category.available, true);
  assert.ok(curve.draftDocumented.corpus.peerCount >= 3);
  assert.ok(curve.draftDocumented.category.peerCount >= 3);

  const steps = curve.draftDocumented.corpus.components.find((c) => c.key === "documentedSteps");
  assert.equal(steps.value, 18);
  assert.ok(["below", "at", "above"].includes(steps.position));
  assert.equal(typeof steps.percentile, "number");

  // Ensure curve math never invents blocker reason ids.
  const blob = JSON.stringify(curve);
  assert.equal(blob.includes("U04.01"), false);
  assert.equal(blob.includes("openrouter"), false);
});
