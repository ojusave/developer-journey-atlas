import test from "node:test";
import assert from "node:assert/strict";

import { buildAssessment } from "../../dist/core/assessment.js";
import { buildComparison } from "../../dist/core/comparison.js";

function row(overrides = {}) {
  return {
    name: "Render",
    slug: "render",
    category: "Cloud and application runtimes",
    research_status: "complete",
    selected_surface: "Dashboard deploy",
    route_selection_method: "documented-default",
    boundary_evidence_type: "explicitly-named",
    first_success_type: "deploy",
    outcome: "App is live.",
    raw_transition_count: 10,
    developer_action_count: 8,
    required_developer_action_count: 7,
    optional_developer_action_count: 1,
    platform_event_count: 2,
    documentation_navigation_count: 1,
    wait_or_async_count: 1,
    gate_count: 3,
    heuristic_effort_score: 9.5,
    comparability_status: "comparable",
    ...overrides,
  };
}

test("buildAssessment joins metrics and degrades without a record", () => {
  const a = buildAssessment(row());
  assert.equal(a.name, "Render");
  assert.equal(a.recordAvailable, false);
  assert.equal(a.metrics.developerActions, 8);
  assert.equal(a.prerequisites.length, 0);
  assert.equal(a.recordUrl, "data/records/render.json");
  assert.match(a.note, /not a ranking/);
});

test("buildAssessment surfaces record detail when present", () => {
  const record = {
    platform: { name: "Render", slug: "render", organization: "Render" },
    category: "Cloud and application runtimes",
    documented_first_success: { official_milestone: "You've deployed your first app." },
    prerequisites: [{ type: "account", requirement: "GitHub account", required: true }],
    friction_gates: [{ type: "account", description: "Sign up" }],
    time_to_first_success: { vendor_claim: false, value: "not documented" },
    primary_path: [{ step_number: 1, action: "Open docs" }],
    sources: [{ id: "S1", title: "Deploy tutorial", url: "https://render.com/docs" }],
    uncertainties: [],
  };
  const a = buildAssessment(row(), record);
  assert.equal(a.recordAvailable, true);
  assert.equal(a.firstSuccess.milestone, "You've deployed your first app.");
  assert.equal(a.prerequisites[0].type, "account");
  assert.equal(a.pathStepCount, 1);
  assert.equal(a.sourceCount, 1);
});

test("buildComparison reports distribution, not a rank, and excludes not-comparable peers", () => {
  const rows = [
    row({ first_success_type: "deploy / host" }),
    row({ name: "Fly", slug: "fly", first_success_type: "deploy / host", developer_action_count: 12, gate_count: 5, heuristic_effort_score: 14, comparability_status: "conditional" }),
    row({ name: "Heroku", slug: "heroku", first_success_type: "deploy / host", developer_action_count: 4, gate_count: 2, heuristic_effort_score: 6, comparability_status: "comparable" }),
    row({ name: "Odd", slug: "odd", first_success_type: "deploy / host", developer_action_count: 99, gate_count: 99, heuristic_effort_score: 99, comparability_status: "not-comparable" }),
    row({ name: "Other Cat", slug: "other", category: "Payments", comparability_status: "comparable" }),
  ];
  const c = buildComparison(rows[0], rows);
  assert.equal(c.peerCount, 3); // fly, heroku, odd (same category, excludes self + payments)
  assert.equal(c.comparablePeerCount, 2); // odd excluded from math
  assert.equal(c.distribution.developerActions.lowerCount, 1); // heroku(4)
  assert.equal(c.distribution.developerActions.higherCount, 1); // fly(12)
  assert.ok(c.peers.some((p) => p.slug === "odd")); // still listed for transparency
});

test("buildComparison only compares peers that reach the same finish line", () => {
  const rows = [
    row({ name: "Render", slug: "render", first_success_type: "deploy / host", developer_action_count: 21, heuristic_effort_score: 35.8 }),
    row({ name: "Heroku", slug: "heroku", first_success_type: "deploy / host", developer_action_count: 11, heuristic_effort_score: 31 }),
    // AWS documents a shallower finish line (account/orientation), so it must
    // not fold into Render's distribution even though its numbers are lower.
    row({ name: "AWS", slug: "aws", first_success_type: "other", developer_action_count: 18, heuristic_effort_score: 29.8 }),
  ];
  const c = buildComparison(rows[0], rows);
  assert.equal(c.finishLine, "deploy / host");
  assert.equal(c.peerCount, 2); // heroku + aws listed
  assert.equal(c.sameFinishLineCount, 1); // only heroku
  assert.equal(c.differentFinishLineCount, 1); // aws
  assert.equal(c.comparablePeerCount, 1); // distribution over heroku only
  // AWS (29.8) is lower than Render (35.8) but must NOT count as "shorter".
  assert.equal(c.distribution.effortScore.lowerCount, 1); // heroku(31) only
  assert.equal(c.distribution.effortScore.higherCount, 0);
  const aws = c.peers.find((p) => p.slug === "aws");
  assert.equal(aws.sameFinishLine, false);
});
