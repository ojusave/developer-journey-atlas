// Generates ds-quality.json: analytical quality and comparability metadata for
// every roster record. This is NOT a ranking and NOT a measure of developer
// experience. It describes record shape, starting-state assumptions, and label
// integrity so downstream notebooks can include or exclude records deliberately.
//
// Deterministic: no wall-clock timestamp. The "as-of" date is derived from the
// newest researched_at in the records, and input_hash pins the exact inputs.
//
// Run: node build-ds-quality.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeRecord, inputHash, sourceSnapshotDate,
  DS_QUALITY_SCHEMA_VERSION, MEASUREMENT_CONTRACT_VERSION, DETECTOR_VERSION,
} from "./lib/measure.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "roster.json"), "utf8"));

const records = [];
const missing = [];

for (const entry of roster) {
  const file = path.join(ROOT, "records", `${entry.slug}.json`);
  if (!fs.existsSync(file)) {
    missing.push(entry.slug);
    continue;
  }
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  const a = analyzeRecord(record);
  records.push({
    slug: entry.slug,
    research_status: record.research_status,
    selected_surface: record.surface?.name || null,
    route_selection_method: a.route_selection_method,
    boundary_evidence_type: a.boundary_evidence_type,
    first_success_type: a.first_success_type,

    raw_transition_count: a.transitions.raw_transition_count,
    developer_action_count: a.transitions.developer_action_count,
    required_developer_action_count: a.transitions.required_developer_action_count,
    optional_developer_action_count: a.transitions.optional_developer_action_count,
    documentation_navigation_count: a.transitions.documentation_navigation_count,
    platform_event_count: a.transitions.platform_event_count,
    wait_or_async_count: a.transitions.wait_or_async_count,
    decision_count: a.transitions.decision_count,

    gate_count: a.transitions.gate_count,
    uncertainty_count: (record.uncertainties || []).length,
    candidate_paths_count: (record.candidate_paths || []).length,

    starting_state: a.startingState,
    execution_environment: a.execution_environment,
    account_requirement: a.requirements.account_requirement,
    payment_requirement: a.requirements.payment_requirement,
    installation_requirement: a.requirements.installation_requirement,
    existing_asset_requirements: a.existing_asset_requirements,
    opaque_signup: a.opaque_signup,
    re_researched: a.re_researched,

    contradictory_success_labels: a.contradictory_success_labels,
    non_atomic_step_count: a.non_atomic_step_count,

    comparability_status: a.comparability_status,
    comparability_reasons: a.comparability_reasons,

    detector_matches: a.detector_matches,
  });
}

const summary = {
  total_records: records.length,
  by_research_status: tally(records, (r) => r.research_status),
  by_comparability_status: tally(records, (r) => r.comparability_status),
  contradictory_success_labels: records.filter((r) => r.contradictory_success_labels).length,
  opaque_signup: records.filter((r) => r.opaque_signup).length,
  re_researched: records.filter((r) => r.re_researched).length,
  with_platform_events: records.filter((r) => r.platform_event_count > 0).length,
  with_documentation_navigation: records.filter((r) => r.documentation_navigation_count > 0).length,
  assumes_existing_asset: records.filter((r) => r.existing_asset_requirements.length > 0).length,
  with_non_atomic_steps: records.filter((r) => r.non_atomic_step_count > 0).length,
};

function tally(rows, keyOf) {
  const out = {};
  for (const row of rows) {
    const k = keyOf(row);
    out[k] = (out[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

const out = {
  schema_version: DS_QUALITY_SCHEMA_VERSION,
  measurement_contract_version: MEASUREMENT_CONTRACT_VERSION,
  detector_version: DETECTOR_VERSION,
  purpose: "Analytical quality and comparability metadata. Not a ranking and not a measure of developer experience. Flags describe record shape, starting-state assumptions, and label integrity so notebooks can include or exclude records deliberately.",
  source_snapshot_date: sourceSnapshotDate(),
  input_hash: inputHash(),
  field_notes: {
    raw_transition_count: "Every object in primary_path. Includes developer actions, platform events, waits, and terminal outcomes.",
    developer_action_count: "Transitions whose actor is the developer or an administrator. developer_action_count + platform_event_count == raw_transition_count.",
    platform_event_count: "Transitions whose actor is the platform, system, or external-system. These are automatic responses, not developer actions.",
    documentation_navigation_count: "Overlay count: transitions whose interface is documentation. A subset of developer actions, reported separately.",
    wait_or_async_count: "Overlay count: distinct steps in a wait phase or targeted by a wait friction gate.",
    decision_count: "Overlay count: distinct steps targeted by a choice friction gate.",
    comparability_status: "comparable | conditional | not-comparable | unreviewed. See comparability_reasons for why.",
    detector_matches: "Every heuristic flag records the field, step number, matched excerpt, rule name, and detector version.",
  },
  summary,
  missing_records: missing,
  records,
};

fs.writeFileSync(path.join(ROOT, "ds-quality.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`ds-quality.json: ${records.length} records | comparability ${JSON.stringify(summary.by_comparability_status)} | contradictions ${summary.contradictory_success_labels}`);
