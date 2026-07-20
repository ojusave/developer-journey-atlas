// Generates selected-path-heuristic.json.
//
// This replaces the old easiest-path.json. The name changed because the old file
// never compared documented alternatives with a common standard, so calling any
// route "easiest" was unsupported. This file scores each record's SELECTED route
// using NORMALIZED measurements (developer actions, gates, waits) from
// lib/measure.mjs, not raw primary_path length.
//
// The score is a unitless heuristic_effort_score, NOT minutes, NOT observed time,
// NOT a vendor claim, and NOT a ranking. It exists to sort routes on one internal
// scale for exploration. The canonical source is always records/*.json.
//
// Deterministic: no wall-clock timestamp; input_hash pins the inputs.
//
// Run: node build-selected-path.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeRecord, inputHash, sourceSnapshotDate,
  MEASUREMENT_CONTRACT_VERSION,
} from "./lib/measure.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "roster.json"), "utf8"));

const SCORE_MODEL_VERSION = "1.0";

// Effort weights operate on NORMALIZED counts, never on raw transitions.
// Platform events are excluded because they are automatic, not developer work.
const WEIGHTS = {
  required_developer_action: 1,
  optional_developer_action: 0.5,
  documentation_navigation: 0.25,
  wait_or_async: 0.5,
};
// Per-friction-gate-type weights.
const GATE_WEIGHTS = {
  account: 3, payment: 3, billing: 3, verification: 2, approval: 2,
  installation: 2, download: 1, credential: 1, permission: 1,
  wait: 1, choice: 1, configuration: 1, environment: 1, form: 1,
  policy: 1, access: 1, dns: 1, domain: 1, hardware: 1, knowledge: 1,
  legal: 1, limit: 1, "rate-limit": 1, terms: 1, other: 1,
};

function gateWeightSum(record) {
  let sum = 0;
  for (const gate of record.friction_gates || []) {
    sum += GATE_WEIGHTS[String(gate.type || "other").toLowerCase()] ?? 1;
  }
  return sum;
}

function effortScore(t, record) {
  const score =
    WEIGHTS.required_developer_action * t.required_developer_action_count +
    WEIGHTS.optional_developer_action * t.optional_developer_action_count +
    WEIGHTS.documentation_navigation * t.documentation_navigation_count +
    WEIGHTS.wait_or_async * t.wait_or_async_count +
    gateWeightSum(record);
  return Math.round(score * 10) / 10;
}

const rows = [];
for (const entry of roster) {
  const file = path.join(ROOT, "records", `${entry.slug}.json`);
  if (!fs.existsSync(file)) continue;
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  const a = analyzeRecord(record);
  const t = a.transitions;
  rows.push({
    name: record.platform.name,
    slug: entry.slug,
    category: record.category,
    research_status: record.research_status,
    selected_surface: record.surface?.name || null,
    route_selection_method: a.route_selection_method,
    boundary_evidence_type: a.boundary_evidence_type,
    first_success_type: a.first_success_type,
    outcome: (record.documented_first_success?.normalized_outcome || "").slice(0, 240),

    raw_transition_count: t.raw_transition_count,
    developer_action_count: t.developer_action_count,
    required_developer_action_count: t.required_developer_action_count,
    optional_developer_action_count: t.optional_developer_action_count,
    platform_event_count: t.platform_event_count,
    documentation_navigation_count: t.documentation_navigation_count,
    wait_or_async_count: t.wait_or_async_count,
    gate_count: t.gate_count,

    heuristic_effort_score: effortScore(t, record),
    comparability_status: a.comparability_status,
  });
}

// Deterministic ordering: by effort score, then developer actions, then name.
rows.sort((a, b) =>
  a.heuristic_effort_score - b.heuristic_effort_score ||
  a.developer_action_count - b.developer_action_count ||
  a.name.localeCompare(b.name));

const out = {
  schema_version: "1.0",
  status: "experimental",
  ranking_allowed: false,
  observed_data: false,
  vendor_claim: false,
  measurement_contract_version: MEASUREMENT_CONTRACT_VERSION,
  score_model_version: SCORE_MODEL_VERSION,
  source_snapshot_date: sourceSnapshotDate(),
  input_hash: inputHash(),
  description: "Per-platform SELECTED documented route with normalized transition counts and a unitless heuristic_effort_score. This is NOT a ranking, NOT observed time, NOT minutes, and NOT a vendor claim. 'Selected' means the record's committed route; documented alternatives were not compared under a shared measurement standard, so this is not an 'easiest path'. Canonical source: records/*.json.",
  caveats: [
    "heuristic_effort_score is a model output over normalized counts, not an observation. Trust ordering more than any absolute value.",
    "Platform events are excluded from the score because they are automatic, not developer work.",
    "Records are only conditionally comparable. Filter with ds-quality.json (comparability_status, starting_state, execution_environment) before comparing across platforms.",
    "Re-researched records use a more compact step granularity than canonical records; see ds-quality.json re_researched.",
  ],
  model: {
    heuristic_effort_score: "weighted sum of normalized developer actions, documentation navigation, waits, and friction-gate weights; platform events excluded",
    action_weights: WEIGHTS,
    gate_weights: GATE_WEIGHTS,
  },
  count: rows.length,
  rows,
};

fs.writeFileSync(path.join(ROOT, "selected-path-heuristic.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`selected-path-heuristic.json: ${rows.length} rows | hash ${out.input_hash.slice(0, 12)}`);
