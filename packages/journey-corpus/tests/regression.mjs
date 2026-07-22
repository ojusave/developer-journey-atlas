// Regression fixtures for the measurement layer. Run: node tests/regression.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { analyzeRecord, firstSuccessType, detectContradictions } from "../lib/measure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (slug) => JSON.parse(fs.readFileSync(path.join(ROOT, "records", `${slug}.json`), "utf8"));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Render: Dashboard Web Service first-deploy path (compacted to official tutorial sections).
test("render: 6 raw / 6 dev / 6 required / 0 optional / 0 platform", () => {
  const t = analyzeRecord(load("render")).transitions;
  assert.equal(t.raw_transition_count, 6);
  assert.equal(t.developer_action_count, 6);
  assert.equal(t.required_developer_action_count, 6);
  assert.equal(t.optional_developer_action_count, 0);
  assert.equal(t.platform_event_count, 0);
  assert.equal(t.developer_action_count + t.platform_event_count, t.raw_transition_count);
});

// 2. Chronosphere: existing tenant + existing metric data assumptions are exposed.
test("chronosphere: exposes existing tenant and existing data assumptions", () => {
  const a = analyzeRecord(load("chronosphere"));
  assert.equal(a.startingState.tenant, "existing-assumed");
  assert.equal(a.startingState.data, "existing-assumed");
  assert.ok(a.existing_asset_requirements.includes("tenant"), "tenant assumption missing");
  assert.ok(a.existing_asset_requirements.includes("data"), "data assumption missing");
  assert.ok(a.comparability_reasons.some((r) => /tenant/.test(r)));
  assert.ok(a.comparability_reasons.some((r) => /data/.test(r)));
});

// 3. Re-researched record granularity is not treated as identical to canonical.
test("re-researched record is flagged with compact-granularity comparability reason", () => {
  const a = analyzeRecord(load("chronosphere"));
  assert.equal(a.re_researched, true);
  assert.ok(a.comparability_reasons.some((r) => /re-researched compact/.test(r)),
    "missing re-researched granularity reason");
});

// 4. Classifier false-positive: a security scan must not be messaging.
test("semgrep: classified as security scan, not messaging", () => {
  const r = load("semgrep");
  const type = firstSuccessType(r);
  assert.equal(type, "security scan / finding");
  assert.notEqual(type, "message / media");
});

// 5. Contradiction detector: repaired records are clean; honest precision is not flagged.
test("no complete record has contradictory selected-route labels", () => {
  const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "roster.json"), "utf8"));
  const offenders = [];
  for (const e of roster) {
    const f = path.join(ROOT, "records", `${e.slug}.json`);
    if (!fs.existsSync(f)) continue;
    if (detectContradictions(JSON.parse(fs.readFileSync(f, "utf8"))).length) offenders.push(e.slug);
  }
  assert.deepEqual(offenders, [], `contradictions remain: ${offenders.join(", ")}`);
});

test("shopify and stytch honest phrasing is not flagged as contradictory", () => {
  assert.equal(detectContradictions(load("shopify")).length, 0, "shopify false positive");
  assert.equal(detectContradictions(load("stytch")).length, 0, "stytch false positive");
});

console.log(`\n${passed} test(s) passed${process.exitCode ? " (with failures)" : ""}`);
