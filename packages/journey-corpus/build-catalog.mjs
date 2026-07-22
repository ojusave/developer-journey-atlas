import fs from "node:fs";
import path from "node:path";

const base = path.dirname(new URL(import.meta.url).pathname);
const roster = JSON.parse(fs.readFileSync(path.join(base, "roster.json"), "utf8"));
const recordsDir = path.join(base, "records");
const auditsDir = path.join(base, "audits");
const auditStatus = JSON.parse(fs.readFileSync(path.join(base, "audit-status.json"), "utf8"));
const statusBySlug = new Map(auditStatus.records.map((record) => [record.slug, record]));

function clean(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

const lines = [
  "# Developer Journey Atlas audit catalog",
  "",
  "Generated from preserved source records and shortest-required-path audits. Counts are published only for verified audits.",
  "",
  "| # | Platform | Category | Audit status | Account creation to first success | Required actions | Required fields | Audit | Source evidence |",
  "|---:|---|---|---|---|---:|---:|---|---|"
];

for (const entry of roster) {
  const file = path.join(recordsDir, `${entry.slug}.json`);
  const status = statusBySlug.get(entry.slug)?.status ?? "pending";
  if (!fs.existsSync(file)) {
    lines.push(`| ${entry.ordinal} | ${clean(entry.name)} | ${clean(entry.category)} | missing source record | withheld | withheld | withheld | none | none |`);
    continue;
  }
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  const auditFile = path.join(auditsDir, `${entry.slug}.json`);
  const audit = fs.existsSync(auditFile) ? JSON.parse(fs.readFileSync(auditFile, "utf8")) : null;
  const verified = status === "verified" && audit?.counts;
  const outcome = audit?.first_success?.outcome ?? "Pending shortest-path re-audit";
  const auditLink = audit ? `[JSON](audits/${entry.slug}.json)` : "none";
  lines.push(
    `| ${entry.ordinal} | ${clean(entry.name)} | ${clean(entry.category)} | ${clean(status)} | ${clean(outcome)} | ${verified ? audit.counts.required_actions : "withheld"} | ${verified ? audit.counts.required_fields : "withheld"} | ${auditLink} | [JSON](records/${entry.slug}.json) |`
  );
}

fs.writeFileSync(path.join(base, "catalog.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${path.join(base, "catalog.md")}`);
