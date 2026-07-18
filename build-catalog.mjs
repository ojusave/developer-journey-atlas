import fs from "node:fs";
import path from "node:path";

const base = path.dirname(new URL(import.meta.url).pathname);
const roster = JSON.parse(fs.readFileSync(path.join(base, "roster.json"), "utf8"));
const recordsDir = path.join(base, "records");

function clean(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

const lines = [
  "# Documented platform first-mile catalog",
  "",
  "Generated from the canonical JSON records. Read the linked record for the complete sourced journey.",
  "",
  "| # | Platform | Category | Status | Selected surface | First meaningful success | Steps | Sources | Vendor time claim |",
  "|---:|---|---|---|---|---|---:|---:|---|"
];

for (const entry of roster) {
  const file = path.join(recordsDir, `${entry.slug}.json`);
  if (!fs.existsSync(file)) {
    lines.push(`| ${entry.ordinal} | ${clean(entry.name)} | ${clean(entry.category)} | missing |  |  | 0 | 0 |  |`);
    continue;
  }
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  const time = record.time_to_first_success?.vendor_claim ? record.time_to_first_success.value : "not documented";
  const candidateSteps = (record.candidate_paths ?? []).reduce((sum, candidate) => sum + (candidate.steps?.length ?? 0), 0);
  const documentedSteps = (record.primary_path?.length ?? 0) + candidateSteps;
  lines.push(
    `| ${entry.ordinal} | [${clean(entry.name)}](records/${entry.slug}.json) | ${clean(entry.category)} | ${clean(record.research_status)} | ${clean(record.surface?.name)} | ${clean(record.documented_first_success?.normalized_outcome)} | ${documentedSteps} | ${record.sources?.length ?? 0} | ${clean(time)} |`
  );
}

fs.writeFileSync(path.join(base, "catalog.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${path.join(base, "catalog.md")}`);
