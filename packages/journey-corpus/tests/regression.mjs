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

// 1. Render: the compact historical record is regression evidence only.
test("render: public reconstruction is not derived from the compact legacy primary path", () => {
  const legacy = load("render");
  const graph = JSON.parse(
    fs.readFileSync(path.join(ROOT, "trust", "journey-graphs", "render.json"), "utf8"),
  );
  assert.ok(
    legacy.primary_path.length < graph.selectedRoute.nodeIds.length,
    "legacy compact path must not be mistaken for the complete selected route",
  );
  assert.equal(graph.selectedRoute.nodeIds.length, 16);
  assert.equal(
    graph.nodes.flatMap((node) => node.requiredFields).length,
    11,
    "public graph must preserve account and service-form fields",
  );
  assert.ok(graph.nodes.some((node) => node.kind === "passive_wait"));
  assert.ok(graph.nodes.some((node) => node.kind === "platform_outcome"));
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
