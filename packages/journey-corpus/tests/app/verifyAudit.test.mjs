import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEligibilityStatus,
  deriveAuditCounts,
  evaluateAuditEligibility,
} from "../../dist/core/auditEligibility.js";
import { runVerifyAudit } from "../../dist/core/runVerifyAudit.js";

function baseAudit(overrides = {}) {
  return {
    schema_version: "1.0",
    platform: { name: "Demo", slug: "demo", category: "Cloud and application runtimes" },
    audit_status: "needs-human-judgment",
    audited_at: "2026-07-22",
    source_record_sha256: "a".repeat(64),
    starting_state: { boundary: "account creation", assumptions: ["browser"] },
    developer_goal: "Deploy something",
    first_success: {
      outcome: "App is live",
      observable_signal: "URL loads",
      source_ids: ["S1"],
    },
    route_selection: {
      surface: "Dashboard",
      rule: "shortest",
      selected: "Dashboard path",
      candidates: [{ name: "Dashboard path", status: "selected", reason: "complete" }],
    },
    required_path: [{
      step_number: 1,
      kind: "account",
      interface: "web-ui",
      action: "Sign up",
      required_fields: [{
        label: "Email",
        field_type: "email",
        evidence_state: "documented",
        source_ids: ["S1"],
      }],
      observable_result: "Account exists",
      evidence_state: "documented",
      source_ids: ["S1"],
    }],
    prerequisites: [],
    external_gates: [],
    unavoidable_waits: [],
    platform_outcomes: [],
    excluded: [],
    sources: [{ id: "S1", title: "Docs", url: "https://example.com", source_type: "official-docs", accessed_at: "2026-07-22" }],
    uncertainties: [],
    counts: { required_actions: 1, required_fields: 1, external_gates: 0, unavoidable_waits: 0 },
    ...overrides,
  };
}

test("evaluateAuditEligibility accepts a clean audit", () => {
  const result = evaluateAuditEligibility(baseAudit());
  assert.equal(result.eligible, true);
  assert.equal(result.reasons.length, 0);
});

test("evaluateAuditEligibility rejects unresolved route and uncertainties", () => {
  const result = evaluateAuditEligibility(baseAudit({
    route_selection: {
      surface: "Dashboard",
      rule: "shortest",
      selected: null,
      candidates: [{ name: "A", status: "unresolved", reason: "peers" }],
    },
    uncertainties: [{ question: "Which SDK?", impact: "path", evidence_needed: "docs" }],
    counts: null,
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((r) => /selected route/i.test(r)));
});

test("applyEligibilityStatus forces NHJ and null counts when ineligible", () => {
  const finalized = applyEligibilityStatus(baseAudit({
    audit_status: "verified",
    route_selection: {
      surface: "x",
      rule: "y",
      selected: null,
      candidates: [],
    },
    counts: { required_actions: 1, required_fields: 1, external_gates: 0, unavoidable_waits: 0 },
  }));
  assert.equal(finalized.audit_status, "needs-human-judgment");
  assert.equal(finalized.counts, null);
});

test("deriveAuditCounts matches path lengths", () => {
  const audit = baseAudit();
  assert.deepEqual(deriveAuditCounts(audit), {
    required_actions: 1,
    required_fields: 1,
    external_gates: 0,
    unavoidable_waits: 0,
  });
});

test("runVerifyAudit checkOnly returns unchanged when already consistent NHJ", async () => {
  const audit = applyEligibilityStatus(baseAudit({
    route_selection: {
      surface: "x",
      rule: "y",
      selected: null,
      candidates: [{ name: "A", status: "unresolved", reason: "peers" }],
    },
    counts: null,
    uncertainties: [{ question: "gap", impact: "x", evidence_needed: "y" }],
  }));
  const outcome = await runVerifyAudit(
    { slug: "demo", checkOnly: true },
    {
      searchDocs: async () => [],
      proposeAudit: async () => ({ status: "invalid_output", message: "unused" }),
      draftAuditContribution: async () => ({ status: "skipped", reason: "unused" }),
    },
    {
      getRecord: () => ({
        platform: { name: "Demo", slug: "demo", organization: "Demo" },
        category: "Cloud and application runtimes",
      }),
      getAudit: () => audit,
      sourceSha256: () => audit.source_record_sha256,
      platformName: () => "Demo",
    },
  );
  assert.equal(outcome.outcome, "unchanged");
});

test("runVerifyAudit completes with draft contribution when propose succeeds", async () => {
  const proposed = baseAudit();
  const outcome = await runVerifyAudit(
    { slug: "demo" },
    {
      searchDocs: async () => [{ title: "Docs", url: "https://example.com" }],
      proposeAudit: async () => ({ status: "ok", audit: proposed }),
      draftAuditContribution: async () => ({
        status: "opened",
        url: "https://github.com/x/y/pull/9",
        reused: false,
      }),
    },
    {
      getRecord: () => ({
        platform: { name: "Demo", slug: "demo", organization: "Demo" },
        category: "Cloud and application runtimes",
      }),
      getAudit: () => undefined,
      sourceSha256: () => "a".repeat(64),
      platformName: () => "Demo",
    },
  );
  assert.equal(outcome.outcome, "completed");
  if (outcome.outcome === "completed") {
    assert.equal(outcome.eligible, true);
    assert.equal(outcome.auditStatus, "verified");
    assert.equal(outcome.contribution.status, "opened");
  }
});
