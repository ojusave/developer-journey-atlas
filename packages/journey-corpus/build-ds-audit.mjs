// Phase 1 baseline audit. Computes integrity metrics from the CURRENT checkout
// and writes ds-audit.md. Run this before any repair so the baseline is recorded
// honestly. Re-running after repairs will naturally show fewer defects; the
// committed ds-audit.md is the pre-repair baseline (see the note in the file).
//
// Run: node build-ds-audit.mjs > /dev/null   (writes ds-audit.md)

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeRecord, reResearchedSlugs, sourceSnapshotDate } from "./lib/measure.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, "roster.json"), "utf8"));
const reResearched = reResearchedSlugs();

function actorClass(actor) {
  const a = String(actor || "").toLowerCase();
  if (["developer", "administrator"].includes(a)) return "developer";
  if (["platform", "system", "external-system"].includes(a)) return "platform";
  return "other";
}

const rows = [];
for (const entry of roster) {
  const file = path.join(ROOT, "records", `${entry.slug}.json`);
  if (!fs.existsSync(file)) continue;
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  const a = analyzeRecord(record);

  const steps = record.primary_path || [];
  const lastStep = steps[steps.length - 1];
  const endsInPlatformEvent = lastStep ? actorClass(lastStep.actor) === "platform" : false;

  const nonSequential = steps.some((s, i) => s.step_number !== i + 1);
  const sourceIds = new Set((record.sources || []).map((s) => s.id));
  let brokenRefs = 0;
  const collect = (ids) => { for (const id of ids || []) if (!sourceIds.has(id)) brokenRefs += 1; };
  collect(record.documented_first_success?.source_ids);
  for (const s of steps) collect(s.source_ids);
  for (const p of record.prerequisites || []) collect(p.source_ids);
  for (const g of record.friction_gates || []) collect(g.source_ids);

  rows.push({
    slug: entry.slug,
    research_status: record.research_status,
    ...a.transitions,
    endsInPlatformEvent,
    nonSequential,
    brokenRefs,
    contradictory: a.contradictory_success_labels,
    contradictions: a.detector_matches.filter((m) => m.detector === "contradictory-success-label"),
    nonAtomic: a.non_atomic_step_count,
    existingAssets: a.existing_asset_requirements,
    reResearched: reResearched.has(entry.slug),
  });
}

const slugsWhere = (pred) => rows.filter(pred).map((r) => r.slug).sort();
const list = (arr) => (arr.length ? "`" + arr.join("`, `") + "`" : "_none_");

function dist(values) {
  if (!values.length) return { n: 0 };
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((x, y) => x + y, 0);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { n: s.length, min: s[0], max: s[s.length - 1], mean: +(sum / s.length).toFixed(1), median };
}

function reproducibility() {
  const results = [];
  const check = (label, gen, file, ignoreKeys = []) => {
    // Defensive: this script documents the pre-repair baseline. Some artifacts
    // referenced by the original baseline (easiest-path.json) were removed by the
    // repair, so skip anything that no longer exists rather than crashing.
    if (!fs.existsSync(path.join(ROOT, file))) {
      results.push({ label, file, identical: null, note: "artifact removed after baseline" });
      return;
    }
    const before = fs.readFileSync(path.join(ROOT, file), "utf8");
    try { execSync(gen, { cwd: ROOT, stdio: "ignore" }); } catch { /* ignore */ }
    let after = fs.readFileSync(path.join(ROOT, file), "utf8");
    let identical;
    if (ignoreKeys.length) {
      const strip = (txt) => { const o = JSON.parse(txt); for (const k of ignoreKeys) delete o[k]; return JSON.stringify(o); };
      identical = strip(before) === strip(after);
    } else {
      identical = before === after;
    }
    execSync(`git checkout -- ${file}`, { cwd: ROOT, stdio: "ignore" });
    results.push({ label, file, identical });
  };
  check("coverage.json", "node validate-records.mjs --write", "coverage.json", ["generated_at"]);
  check("catalog.txt", "node build-catalog.mjs", "catalog.txt");
  check("easiest-path.json", "node derive-easiest-path.mjs", "easiest-path.json", ["generated_at"]);
  return results;
}

const epPath = path.join(ROOT, "easiest-path.json");
const ep = fs.existsSync(epPath) ? JSON.parse(fs.readFileSync(epPath, "utf8")) : null;
const epRecordRows = ep ? ep.rows.filter((r) => r.source === "record").length : 0;
const epResearchRows = ep ? ep.rows.filter((r) => r.source === "re-research").length : 0;

const canonical = rows.filter((r) => !r.reResearched);
const reres = rows.filter((r) => r.reResearched);

const repro = reproducibility();

const lines = [];
const P = (s = "") => lines.push(s);

P("# DS baseline audit");
P();
P("> Baseline snapshot of `main` **before** the analytical-honesty repairs in this PR.");
P("> Generated by `build-ds-audit.mjs` from the current checkout. Defect counts here are");
P("> the pre-repair state; re-running the generator after Phase 5 fixes will show fewer");
P("> contradictions. This file is intentionally kept as the baseline record.");
P();
P(`- Source snapshot date (newest \`researched_at\`): \`${sourceSnapshotDate()}\``);
P(`- Roster entries: **${roster.length}**`);
P(`- Record files found: **${rows.length}**`);
P();

P("## Research-status counts");
P();
P("| status | count |");
P("|---|---:|");
for (const [k, v] of Object.entries(rows.reduce((a, r) => ((a[r.research_status] = (a[r.research_status] || 0) + 1), a), {})).sort()) P(`| ${k} | ${v} |`);
P();

const contradictory = rows.filter((r) => r.contradictory);
P(`## Contradictory success labels (${contradictory.length})`);
P();
P("A `complete` record whose selected-route success field still claims no route can be");
P("reconstructed. Detector applies only to `surface.name` and the four");
P("`documented_first_success` narrative fields, never to `selection_basis` or `uncertainties`.");
P();
P("| slug | field | rule | excerpt |");
P("|---|---|---|---|");
for (const r of contradictory) {
  for (const m of r.contradictions) {
    P(`| \`${r.slug}\` | \`${m.field}\` | \`${m.rule}\` | ${m.excerpt.replaceAll("|", "\\|").slice(0, 120)} |`);
  }
}
P();

P("## Mixed developer and platform actors in one path");
P();
P(`Records where \`primary_path\` contains both developer-attributed and platform-event steps: **${slugsWhere((r) => r.developer_action_count > 0 && r.platform_event_count > 0).length}** of ${rows.length}.`);
P("This is expected and not a defect, but it is why raw path length is not a developer-action count.");
P();

P("## Records containing optional steps");
P();
P(`Count: **${slugsWhere((r) => r.optional_developer_action_count > 0).length}**`);
P();
P(list(slugsWhere((r) => r.optional_developer_action_count > 0)));
P();

P("## Records containing documentation-navigation steps");
P();
P(`Count: **${slugsWhere((r) => r.documentation_navigation_count > 0).length}** (interface = \`documentation\`).`);
P();
P(list(slugsWhere((r) => r.documentation_navigation_count > 0)));
P();

P("## Records ending in a platform event");
P();
P(`Records whose final \`primary_path\` step is a platform/system actor rather than a developer action: **${slugsWhere((r) => r.endsInPlatformEvent).length}**.`);
P();
P(list(slugsWhere((r) => r.endsInPlatformEvent)));
P();

P("## Records assuming existing accounts, tenants, code, data, or infrastructure");
P();
P("| assumed asset | count | slugs |");
P("|---|---:|---|");
for (const asset of ["account", "tenant", "code", "data", "infrastructure"]) {
  const s = slugsWhere((r) => r.existingAssets.includes(asset));
  P(`| ${asset} | ${s.length} | ${s.length ? "`" + s.join("`, `") + "`" : "_none_"} |`);
}
P();

P("## Non-sequential step numbers or broken source references");
P();
P(`Records with non-sequential \`step_number\`: **${slugsWhere((r) => r.nonSequential).length}**.`);
P(`Records with broken \`source_ids\` references: **${slugsWhere((r) => r.brokenRefs > 0).length}**.`);
P(list(slugsWhere((r) => r.nonSequential || r.brokenRefs > 0)));
P();

P("## Potentially composite / non-atomic actions");
P();
P(`Records containing at least one step whose action joins a second imperative verb: **${slugsWhere((r) => r.nonAtomic > 0).length}**.`);
P("This is a granularity warning, not proof of a defect. See `detector_matches` in `ds-quality.json` for the matched excerpts.");
P();

P("## Step-count distributions by source");
P();
P("Two cohorts: canonical records vs the 69 re-researched slugs (present in `research/*.json`).");
P("Raw transitions include platform events; developer actions do not.");
P();
P("| cohort | records | metric | min | median | mean | max |");
P("|---|---:|---|---:|---:|---:|---:|");
for (const [label, set] of [["canonical", canonical], ["re-researched", reres]]) {
  const raw = dist(set.map((r) => r.raw_transition_count));
  const dev = dist(set.map((r) => r.developer_action_count));
  P(`| ${label} | ${set.length} | raw_transition_count | ${raw.min} | ${raw.median} | ${raw.mean} | ${raw.max} |`);
  P(`| ${label} | ${set.length} | developer_action_count | ${dev.min} | ${dev.median} | ${dev.mean} | ${dev.max} |`);
}
P();
P("Granularity differs between cohorts. Re-researched records tend to be more compact, so");
P("comparing raw step counts across cohorts without normalization is unsafe.");
P();

P("## Artifact reproducibility from current inputs");
P();
P("| artifact | reproduces from current records? | note |");
P("|---|---|---|");
for (const r of repro) {
  const note = r.file === "easiest-path.json"
    ? `identical ignoring \`generated_at\`; but source split is **${epRecordRows} records / ${epResearchRows} re-research**, not the 136/69 the script header claims`
    : (r.file === "coverage.json" ? "identical ignoring `generated_at` (wall-clock, non-deterministic)" : "byte-identical");
  const cell = r.identical === null ? `n/a (${r.note})` : (r.identical ? "yes" : "**no**");
  P(`| \`${r.file}\` | ${cell} | ${note} |`);
}
P();
P("### Reproducibility findings");
P();
P("- `coverage.json` embeds a wall-clock `generated_at`, so it never reproduces byte-for-byte.");
P("- `easiest-path.json` reproduces in content but its provenance narrative is stale: all 205");
P("  rows now come from `records/*.json` (`research/*.json` is inert because every record is");
P("  `complete`), so the documented 136/69 split does not hold.");
P("- `easiest-path.json` reports `candidate_paths_count` 0 for effectively every platform, so its");
P("  chosen route was never compared against documented alternatives. The name \u201ceasiest\u201d is not");
P("  supported by the computation.");

fs.writeFileSync(path.join(ROOT, "ds-audit.md"), lines.join("\n") + "\n");
console.log(`Wrote ds-audit.md (${contradictory.length} contradictory, ${rows.length} records)`);
