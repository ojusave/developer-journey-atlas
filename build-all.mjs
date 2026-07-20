// One command to validate records and regenerate every derived artifact
// deterministically, then validate again.
//
//   node build-all.mjs           regenerate coverage.json, catalog.md,
//                                ds-quality.json, selected-path-heuristic.json
//   node build-all.mjs --check   same, then fail if regeneration left a dirty
//                                git diff (used in CI to catch stale artifacts)
//
// ds-audit.md is intentionally NOT regenerated here: it is a pre-repair baseline.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const check = process.argv.includes("--check");

const GENERATED = ["coverage.json", "catalog.md", "ds-quality.json", "selected-path-heuristic.json"];

const KNOWN_DETECTORS = new Set(["starting-state", "opaque-signup", "contradictory-success-label", "non-atomic-step"]);
const COMPARABILITY_ENUM = new Set(["comparable", "conditional", "not-comparable", "unreviewed"]);
const EXECUTION_ENUM = new Set(["local", "playground", "hosted", "hybrid"]);
const REQUIREMENT_ENUM = new Set(["required", "not-required", "opaque"]);

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function fail(msg) {
  console.error(`\nbuild-all: ${msg}`);
  process.exit(1);
}

// 1. Validate records (also writes coverage.json). Nonzero exit on invalid.
try {
  execSync("node validate-records.mjs --write", { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
} catch {
  fail("record validation failed");
}
console.log("validated records + wrote coverage.json");

// 2-4. Generate catalog, ds-quality, selected-path.
run("node build-catalog.mjs");
run("node build-ds-quality.mjs");
run("node build-selected-path.mjs");

// 5. Validate ds-quality.json structure (enums, detector rules, coverage).
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "roster.json"), "utf8"));
const dq = JSON.parse(fs.readFileSync(path.join(ROOT, "ds-quality.json"), "utf8"));
const dqErrors = [];
if (dq.schema_version !== "1.0") dqErrors.push(`unexpected schema_version ${dq.schema_version}`);
if ((dq.missing_records || []).length) dqErrors.push(`missing quality records: ${dq.missing_records.join(", ")}`);
const dqSlugs = new Set(dq.records.map((r) => r.slug));
for (const entry of roster) if (!dqSlugs.has(entry.slug)) dqErrors.push(`ds-quality missing roster slug ${entry.slug}`);
for (const r of dq.records) {
  if (!COMPARABILITY_ENUM.has(r.comparability_status)) dqErrors.push(`${r.slug}: invalid comparability_status ${r.comparability_status}`);
  if (!EXECUTION_ENUM.has(r.execution_environment)) dqErrors.push(`${r.slug}: invalid execution_environment ${r.execution_environment}`);
  for (const key of ["account_requirement", "payment_requirement", "installation_requirement"]) {
    if (!REQUIREMENT_ENUM.has(r[key])) dqErrors.push(`${r.slug}: invalid ${key} ${r[key]}`);
  }
  if (r.developer_action_count + r.platform_event_count !== r.raw_transition_count) {
    dqErrors.push(`${r.slug}: developer + platform (${r.developer_action_count}+${r.platform_event_count}) != raw ${r.raw_transition_count}`);
  }
  for (const m of r.detector_matches || []) {
    if (!KNOWN_DETECTORS.has(m.detector)) dqErrors.push(`${r.slug}: unknown detector ${m.detector}`);
    if (!m.rule) dqErrors.push(`${r.slug}: detector_match missing rule`);
    if (!m.detector_version) dqErrors.push(`${r.slug}: detector_match missing detector_version`);
  }
}
if (dqErrors.length) fail("ds-quality.json invalid:\n  - " + dqErrors.join("\n  - "));
console.log("validated ds-quality.json structure");

// 6. Validate records once more (belt and suspenders).
try {
  execSync("node validate-records.mjs", { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
} catch {
  fail("second record validation failed");
}
console.log("re-validated records");

// 7. Dirty-diff gate.
if (check) {
  const status = execSync(`git status --porcelain ${GENERATED.join(" ")}`, { cwd: ROOT }).toString().trim();
  if (status) fail(`generation left a dirty diff (stale committed artifacts):\n${status}`);
  console.log("\nbuild-all --check: generated artifacts are up to date");
}
console.log("\nbuild-all: done");
