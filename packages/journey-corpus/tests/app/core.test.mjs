import test from "node:test";
import assert from "node:assert/strict";

import { buildAssessment } from "../../dist/core/assessment.js";
import { buildComparison } from "../../dist/core/comparison.js";
import { buildDocumentedOnboardingLoad } from "../../dist/core/onboardingLoad.js";
import { InMemoryDataStore } from "../../dist/adapters/fakes.js";

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

test("buildAssessment surfaces documented content and degrades without a record", () => {
  const a = buildAssessment(row());
  assert.equal(a.name, "Render");
  assert.equal(a.recordAvailable, false);
  assert.equal(a.steps.length, 0);
  assert.equal(a.prerequisites.length, 0);
  assert.equal(a.recordUrl, "/data/records/render.json");
  assert.equal(a.auditStatus, "pending");
  assert.equal(a.routeSignals, null);
  assert.match(a.note, /Counts and peer comparison are withheld/);
  // The public assessment may expose direct counts, but never the internal
  // weighted effort score or a rank.
  assert.ok(!("heuristic_effort_score" in a));
  assert.ok(!("effortScore" in a));
  assert.ok(!("rank" in a));
});

test("buildAssessment falls back to primary_path when no audit is present", () => {
  const record = {
    platform: { name: "You.com", slug: "you-com", organization: "You.com" },
    category: "AI, ML, and agents",
    researched_at: "2026-07-22",
    documented_first_success: { normalized_outcome: "Search API returns JSON." },
    prerequisites: [{ order: 1, type: "account", requirement: "You.com account", required: true }],
    friction_gates: [{ at_step: 3, type: "credential", description: "Create an API key" }],
    primary_path: [
      { step_number: 1, phase: "arrive", actor: "developer", interface: "browser", action: "Open quickstart", required: true, source_ids: ["S1"] },
      { step_number: 2, phase: "account", actor: "developer", interface: "web-ui", action: "Sign in", required: true, source_ids: ["S1"] },
    ],
    sources: [{ id: "S1", title: "Quickstart", url: "https://you.com/docs" }],
    uncertainties: [],
  };
  const a = buildAssessment(row({ name: "You.com", slug: "you-com", category: "AI, ML, and agents" }), record);
  assert.equal(a.steps.length, 2);
  assert.equal(a.steps[0].action, "Open quickstart");
  assert.equal(a.steps[1].action, "Sign in");
  assert.equal(a.prerequisites.length, 1);
  assert.equal(a.frictionGates.length, 1);
  assert.equal(a.frictionGates[0].description, "Create an API key");
  assert.equal(a.auditStatus, "pending");
});

test("buildAssessment surfaces documented steps and record detail when present", () => {
  const record = {
    platform: { name: "Render", slug: "render", organization: "Render Services, Inc." },
    category: "Cloud and application runtimes",
    researched_at: "2026-07-19",
    documented_first_success: { official_milestone: "You've deployed your first app." },
    prerequisites: [{ order: 1, type: "account", requirement: "GitHub account", required: true }],
    friction_gates: [{ at_step: 3, type: "account", description: "Sign up" }],
    time_to_first_success: { vendor_claim: false, value: "not documented" },
    primary_path: [
      { step_number: 1, phase: "arrive", actor: "developer", interface: "documentation", action: "Open docs", success_signal: "Docs load", required: true, source_ids: ["S1"] },
    ],
    sources: [{ id: "S1", title: "Deploy tutorial", url: "https://render.com/docs" }],
    uncertainties: [],
  };
  const pathAudit = {
    audit_status: "verified",
    audited_at: "2026-07-21",
    route_selection: { selected: "Dashboard deploy", surface: "Dashboard" },
    first_success: { outcome: "App is live.", observable_signal: "Root content loads." },
    prerequisites: [{ description: "GitHub repository" }],
    external_gates: [{ description: "Authorize GitHub" }],
    unavoidable_waits: [{ description: "Wait for deploy" }],
    required_path: [{
      step_number: 1,
      kind: "account",
      interface: "web-ui",
      action: "Create account",
      observable_result: "Dashboard opens",
      evidence_state: "documented",
      source_ids: ["S1"],
      required_fields: [{ label: "Email", field_type: "email", evidence_state: "documented", source_ids: ["S1"] }],
    }],
    sources: [{ id: "S1", title: "Deploy tutorial", url: "https://render.com/docs" }],
    uncertainties: [],
    counts: { required_actions: 1, required_fields: 1, external_gates: 1, unavoidable_waits: 1 },
  };
  const a = buildAssessment(row(), record, null, pathAudit);
  assert.equal(a.recordAvailable, true);
  assert.equal(a.organization, "Render Services, Inc.");
  assert.equal(a.researchedAt, "2026-07-21");
  assert.equal(a.firstSuccess.milestone, "App is live.");
  assert.equal(a.prerequisites[0].type, "account");
  assert.equal(a.prerequisites[0].requirement, "GitHub account");
  assert.equal(a.prerequisites[0].required, true);
  assert.equal(a.steps.length, 1);
  assert.equal(a.steps[0].action, "Create account");
  assert.equal(a.steps[0].requiredFields[0].label, "Email");
  assert.equal(a.steps[0].successSignal, "Dashboard opens");
  assert.equal(a.frictionGates[0].type, "external gate");
  assert.equal(a.pathStepCount, 1);
  assert.equal(a.sourceCount, 1);
  assert.equal(a.routeSignals.requiredFields, 1);
});

test("buildAssessment prefers typed record prerequisites over audit stubs", () => {
  const record = {
    platform: { name: "Plaid", slug: "plaid", organization: "Plaid" },
    category: "Payments",
    prerequisites: [
      { order: 1, type: "software", requirement: "Node.js for the quickstart", required: true },
      { order: 2, type: "software", requirement: "Optional IDE only", required: false },
    ],
    friction_gates: [],
    primary_path: [],
    sources: [],
    uncertainties: [],
  };
  const pathAudit = {
    audit_status: "needs-human-judgment",
    audited_at: "2026-07-22",
    route_selection: { selected: null, surface: "Quickstart" },
    first_success: { outcome: "API call succeeds.", observable_signal: "200" },
    prerequisites: [{ description: "npm and a Unix-capable shell" }],
    external_gates: [],
    unavoidable_waits: [],
    required_path: [],
    sources: [],
    uncertainties: [],
    counts: null,
  };
  const a = buildAssessment(row({ name: "Plaid", slug: "plaid", category: "Payments" }), record, null, pathAudit);
  assert.equal(a.prerequisites.length, 2);
  assert.equal(a.prerequisites[0].type, "software");
  assert.equal(a.prerequisites[0].required, true);
  assert.match(a.prerequisites[0].requirement, /Node/);
  assert.equal(a.prerequisites[1].type, "software");
  assert.equal(a.prerequisites[1].required, false);
  assert.notEqual(a.prerequisites[0].requirement, a.prerequisites[1].requirement);
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

function quality(slug, overrides = {}) {
  return {
    slug,
    decision_count: 1,
    re_researched: false,
    comparability_status: "comparable",
    ...overrides,
  };
}

function audit(slug, overrides = {}) {
  return {
    platform: { slug },
    audit_status: "verified",
    counts: { required_actions: 6, required_fields: 5, unavoidable_waits: 1, external_gates: 3 },
    ...overrides,
  };
}

test("documented onboarding load uses transparent components and anonymizes peers", () => {
  const rows = [
    row({ slug: "render", name: "Render", first_success_type: "deploy / host", required_developer_action_count: 8, wait_or_async_count: 1, gate_count: 3 }),
    row({ slug: "peer-a", name: "Peer A", first_success_type: "deploy / host", required_developer_action_count: 4, wait_or_async_count: 0, gate_count: 2 }),
    row({ slug: "peer-b", name: "Peer B", first_success_type: "deploy / host", required_developer_action_count: 6, wait_or_async_count: 1, gate_count: 3 }),
    row({ slug: "peer-c", name: "Peer C", first_success_type: "deploy / host", required_developer_action_count: 10, wait_or_async_count: 2, gate_count: 4 }),
  ];
  const audits = Object.fromEntries(rows.map((candidate) => [candidate.slug, audit(candidate.slug, {
    counts: {
      required_actions: candidate.required_developer_action_count,
      required_fields: 5,
      unavoidable_waits: candidate.wait_or_async_count,
      external_gates: candidate.gate_count,
    },
  })]));
  const store = new InMemoryDataStore(rows, {}, Object.fromEntries(rows.map((candidate) => [candidate.slug, quality(candidate.slug)])), audits);
  const load = buildDocumentedOnboardingLoad(rows[0], store);
  assert.equal(load.available, true);
  assert.equal(load.peerCount, 3);
  assert.equal(load.components.length, 4);
  assert.equal(load.components.find((component) => component.key === "requiredActions").peerMedian, 6);
  assert.equal(load.components.find((component) => component.key === "requiredFields").peerMedian, 5);
  assert.match(load.note, /not a drop-off score/);
  const publicOutput = JSON.stringify(load);
  assert.doesNotMatch(publicOutput, /Peer A|peer-a|Peer B|peer-b|Peer C|peer-c/);
});

test("documented onboarding load refuses cohorts smaller than three", () => {
  const rows = [
    row({ slug: "render", first_success_type: "deploy / host" }),
    row({ slug: "peer-a", first_success_type: "deploy / host" }),
    row({ slug: "peer-b", first_success_type: "other" }),
  ];
  const audits = Object.fromEntries(rows.map((candidate) => [candidate.slug, audit(candidate.slug)]));
  const store = new InMemoryDataStore(rows, {}, Object.fromEntries(rows.map((candidate) => [candidate.slug, quality(candidate.slug)])), audits);
  const load = buildDocumentedOnboardingLoad(rows[0], store);
  assert.equal(load.available, false);
  assert.equal(load.peerCount, 1);
  assert.match(load.summary, /At least 3/);
});

test("documented onboarding load keeps research granularity cohorts separate", () => {
  const rows = [
    row({ slug: "render", first_success_type: "deploy / host" }),
    row({ slug: "peer-a", first_success_type: "deploy / host" }),
    row({ slug: "peer-b", first_success_type: "deploy / host" }),
    row({ slug: "peer-c", first_success_type: "deploy / host" }),
  ];
  const qualityRows = Object.fromEntries(rows.map((candidate) => [candidate.slug, quality(candidate.slug, { re_researched: candidate.slug !== "render" })]));
  const audits = Object.fromEntries(rows.map((candidate) => [candidate.slug, audit(candidate.slug)]));
  const store = new InMemoryDataStore(rows, {}, qualityRows, audits);
  const load = buildDocumentedOnboardingLoad(rows[0], store);
  assert.equal(load.available, false);
  assert.equal(load.peerCount, 0);
});
