// Generates selected-path-heuristic.json.
//
// EXPERIMENTAL / INTERNAL. NOT SHOWN ON THE PUBLIC SITE.
// The public First-Mile Atlas shows documented onboarding steps only, with no
// score, no rank, and no leaderboard. This generator and its output are kept in
// the repo for reproducibility and transparency (they are not being deleted),
// but they are internal. build-site.mjs deliberately does not publish
// selected-path-heuristic.json, and no API or UI surfaces its numbers. A
// properly verified benchmark may return later, once the underlying step claims
// are checked against their sources (see `npm run verify`).
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
  selectedPathRow, inputHash, sourceSnapshotDate,
  MEASUREMENT_CONTRACT_VERSION, WEIGHTS, GATE_WEIGHTS,
} from "./lib/measure.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "roster.json"), "utf8"));

const SCORE_MODEL_VERSION = "1.0";

const rows = [];
for (const entry of roster) {
  const file = path.join(ROOT, "records", `${entry.slug}.json`);
  if (!fs.existsSync(file)) continue;
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  // slug is pinned to the roster entry so ordering/output stays byte-identical.
  rows.push({ ...selectedPathRow(record), slug: entry.slug });
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
