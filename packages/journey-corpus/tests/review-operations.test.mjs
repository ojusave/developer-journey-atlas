import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(script, args = []) {
  return spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("every corpus record has exactly one allowed operational disposition", () => {
  const result = run("scripts/build-corpus-health.mjs", ["--check"]);
  assert.equal(result.status, 0, result.stderr);

  const health = JSON.parse(readFileSync(path.join(root, "corpus-health.json"), "utf8"));
  const allowed = new Set([
    "published",
    "excluded",
    "stale",
    "identity_needs_approval",
    "evidence_needs_review",
    "route_needs_review",
  ]);
  assert.equal(health.records.length, 224);
  assert.equal(
    Object.values(health.summary.dispositions).reduce((sum, count) => sum + count, 0),
    health.records.length,
  );
  for (const record of health.records) {
    assert.ok(allowed.has(record.operational_disposition.status));
    assert.ok(Array.isArray(record.operational_disposition.machine_readable_reasons));
    assert.ok(record.operational_disposition.failed_evidence);
    assert.ok(record.operational_disposition.generated_files_on_approval.length > 0);
  }
});

test("maintainer-selected LLM API cohort remains the review priority", () => {
  const result = run("scripts/build-corpus-health.mjs", ["--check"]);
  assert.equal(result.status, 0, result.stderr);

  const health = JSON.parse(readFileSync(path.join(root, "corpus-health.json"), "utf8"));
  assert.equal(health.review_operations.priority_cohort_id, "llm-api-first-response");
  assert.equal(health.review_operations.closest_cohort, "llm-api-first-response");
  const cohort = health.review_operations.candidate_cohorts.find(
    (candidate) => candidate.id === "llm-api-first-response",
  );
  assert.ok(cohort);
  assert.equal(cohort.required_platform_count, 10);
  assert.equal(cohort.participants.length, 10);
  assert.match(cohort.required_review_sequence.at(-1), /all 10 routes pass/);
  const migration = JSON.parse(readFileSync(path.join(root, "migration-analysis.json"), "utf8"));
  assert.equal(migration.launch_review.candidate_platforms, 26);
  assert.equal(migration.launch_review.public_route_shortfall, 25);
});

test("Reason Lab enforces independent labels and adjudication before eligibility", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "reason-lab-"));
  const packetPath = path.join(directory, "blocker-labeling-packet.json");
  cpSync(path.join(root, "evaluation", "blocker-labeling-packet.json"), packetPath);
  cpSync(
    path.join(root, "evaluation", "blocker-evaluation-status.json"),
    path.join(directory, "blocker-evaluation-status.json"),
  );
  const packet = JSON.parse(readFileSync(packetPath, "utf8"));
  const reasonId = JSON.parse(readFileSync(path.join(root, "blocker-catalog.json"), "utf8"))
    .nodes.find((node) => node.kind === "reason").id;

  const earlyAdjudication = run("scripts/reason-lab.mjs", [
    "adjudicate",
    "G001",
    "abstain",
    "--packet",
    packetPath,
  ]);
  assert.equal(earlyAdjudication.status, 1);
  assert.match(earlyAdjudication.stderr, /requires completed reviewer_a and reviewer_b/);

  assert.equal(run("scripts/reason-lab.mjs", [
    "label", "G001", "reviewer_a", reasonId,
    "--reviewer-id", "reviewer-one",
    "--packet", packetPath,
  ]).status, 0);
  assert.equal(run("scripts/reason-lab.mjs", [
    "taxonomy-gap", "G001", "reviewer_b",
    "--reviewer-id", "reviewer-two",
    "--packet", packetPath,
  ]).status, 0);

  let sample = JSON.parse(readFileSync(packetPath, "utf8")).samples[0];
  assert.equal(sample.adjudication_state, "disagreement");
  assert.equal(sample.evaluation_eligible, false);
  assert.equal(sample.reviewer_a.reviewer_id, "reviewer-one");
  assert.equal(sample.reviewer_b.reviewer_id, "reviewer-two");
  assert.ok(sample.reviewer_a.labeled_at);

  const duplicateReviewer = run("scripts/reason-lab.mjs", [
    "label", "G001", "reviewer_b", reasonId,
    "--reviewer-id", "reviewer-one",
    "--packet", packetPath,
  ]);
  assert.equal(duplicateReviewer.status, 1);
  assert.match(duplicateReviewer.stderr, /must use distinct reviewer IDs/);

  assert.equal(run("scripts/reason-lab.mjs", [
    "adjudicate", "G001", "abstain",
    "--reviewer-id", "adjudicator-one",
    "--packet", packetPath,
  ]).status, 0);
  sample = JSON.parse(readFileSync(packetPath, "utf8")).samples[0];
  assert.equal(sample.adjudication_state, "adjudicated");
  assert.equal(sample.evaluation_eligible, true);
  assert.equal(sample.public_eligible, false);
  assert.equal(sample.adjudication.reviewer_id, "adjudicator-one");
  assert.equal(packet.samples.length, 100);
});
