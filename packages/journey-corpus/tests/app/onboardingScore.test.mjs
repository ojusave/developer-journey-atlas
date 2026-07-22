import test from "node:test";
import assert from "node:assert/strict";
import { buildOnboardingScore, MIN_SCORE_PEERS } from "../../dist/core/onboardingScore.js";

function row(slug, overrides = {}) {
  return {
    name: slug,
    slug,
    category: "AI, ML, and agents",
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
    gate_count: 2,
    heuristic_effort_score: 10,
    comparability_status: "comparable",
    ...overrides,
  };
}

test("overall and peer placements use finish-line peers and percentile bands", () => {
  const target = row("openai", { heuristic_effort_score: 11, required_developer_action_count: 6, gate_count: 3 });
  const rows = [
    target,
    row("cohere", { heuristic_effort_score: 8 }),
    row("fireworks", { heuristic_effort_score: 11.3 }),
    row("groq", { heuristic_effort_score: 12.3 }),
    row("mistral", { heuristic_effort_score: 13.3 }),
    // different finish line: ignored for both scopes
    row("render", {
      category: "Cloud and application runtimes",
      first_success_type: "deploy / host",
      heuristic_effort_score: 40,
    }),
    // different category, same finish line: overall only
    row("mailgun", {
      category: "Communications, media, and social",
      heuristic_effort_score: 6,
    }),
    row("twilio", {
      category: "Communications, media, and social",
      heuristic_effort_score: 29,
    }),
    row("sendgrid", {
      category: "Communications, media, and social",
      heuristic_effort_score: 15,
    }),
  ];

  const score = buildOnboardingScore(target, rows);
  assert.equal(score.name, "Documented Onboarding Load");
  assert.equal(score.finishLine, "first API/SDK call");
  assert.equal(score.breakdown.effort, 11);
  assert.equal(score.overall.available, true);
  assert.equal(score.peers.available, true);
  // AI same-finish peers: cohere, fireworks, groq, mistral (4) >= 3
  assert.equal(score.peers.peerCount, 4);
  // overall same-finish: 4 AI + 3 communications = 7
  assert.equal(score.overall.peerCount, 7);
  assert.ok(score.overall.score != null);
  assert.ok(["light", "moderate", "heavy"].includes(score.overall.band));
  assert.match(score.note, /Documentation-derived/);
});

test("placement unavailable below min peers", () => {
  const target = row("lonely", { category: "Maps and location APIs" });
  const rows = [
    target,
    row("only-one", { category: "Maps and location APIs", heuristic_effort_score: 9 }),
  ];
  const score = buildOnboardingScore(target, rows);
  assert.equal(score.peers.available, false);
  assert.equal(score.peers.peerCount, 1);
  assert.match(score.peers.summary, new RegExp(String(MIN_SCORE_PEERS)));
});

test("not-comparable peers are excluded", () => {
  const target = row("alpha", { heuristic_effort_score: 10 });
  const rows = [
    target,
    row("beta", { heuristic_effort_score: 8 }),
    row("gamma", { heuristic_effort_score: 12 }),
    row("delta", { heuristic_effort_score: 14 }),
    row("bad", { heuristic_effort_score: 99, comparability_status: "not-comparable" }),
  ];
  const score = buildOnboardingScore(target, rows);
  assert.equal(score.peers.peerCount, 3);
  assert.equal(score.peers.available, true);
});
