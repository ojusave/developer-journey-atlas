import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditsDir = path.join(projectRoot, "audits");
const recordsDir = path.join(projectRoot, "records");
const statusPath = path.join(projectRoot, "audit-status.json");
const checkOnly = process.argv.includes("--check");

const schema = JSON.parse(await readFile(path.join(projectRoot, "shortest-path-audit.schema.json"), "utf8"));
const roster = JSON.parse(await readFile(path.join(projectRoot, "roster.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

function assertSourceRefs(audit, filename) {
  const ids = new Set(audit.sources.map((source) => source.id));
  const check = (sourceIds, owner) => {
    for (const sourceId of sourceIds) {
      if (!ids.has(sourceId)) fail(`${filename}: ${owner} references missing source ${sourceId}`);
    }
  };

  check(audit.first_success.source_ids, "first_success");
  for (const [index, action] of audit.required_path.entries()) {
    check(action.source_ids, `required_path[${index}]`);
    for (const [fieldIndex, field] of action.required_fields.entries()) {
      check(field.source_ids, `required_path[${index}].required_fields[${fieldIndex}]`);
    }
  }
  for (const key of ["prerequisites", "external_gates", "unavoidable_waits", "platform_outcomes"]) {
    for (const [index, item] of audit[key].entries()) check(item.source_ids, `${key}[${index}]`);
  }
  for (const [index, item] of audit.excluded.entries()) check(item.source_ids, `excluded[${index}]`);
}

const auditFiles = (await readdir(auditsDir)).filter((name) => name.endsWith(".json")).sort();
const audits = new Map();

for (const filename of auditFiles) {
  const audit = JSON.parse(await readFile(path.join(auditsDir, filename), "utf8"));
  if (!validate(audit)) {
    fail(`${filename}: schema validation failed\n${ajv.errorsText(validate.errors, { separator: "\n" })}`);
  }
  const slug = filename.replace(/\.json$/, "");
  if (audit.platform.slug !== slug) fail(`${filename}: platform slug does not match filename`);
  if (audits.has(slug)) fail(`${filename}: duplicate audit slug ${slug}`);

  const record = await readFile(path.join(recordsDir, filename));
  const actualHash = sha256(record);
  if (audit.source_record_sha256 !== actualHash) {
    fail(`${filename}: source record hash changed, expected ${audit.source_record_sha256}, got ${actualHash}`);
  }

  audit.required_path.forEach((action, index) => {
    if (action.step_number !== index + 1) fail(`${filename}: required path step numbers must be contiguous from 1`);
  });
  assertSourceRefs(audit, filename);

  if (audit.audit_status === "verified") {
    const unverifiedAction = audit.required_path.find((action) => action.evidence_state === "unverified");
    const unverifiedField = audit.required_path.flatMap((action) => action.required_fields).find((field) => field.evidence_state === "unverified");
    if (unverifiedAction || unverifiedField) fail(`${filename}: verified audit contains unverified evidence`);
    const requiredFields = audit.required_path.reduce((total, action) => total + action.required_fields.length, 0);
    if (audit.counts.required_actions !== audit.required_path.length) fail(`${filename}: required action count does not match path`);
    if (audit.counts.required_fields !== requiredFields) fail(`${filename}: required field count does not match path`);
    if (audit.counts.external_gates !== audit.external_gates.length) fail(`${filename}: external gate count does not match list`);
    if (audit.counts.unavoidable_waits !== audit.unavoidable_waits.length) fail(`${filename}: unavoidable wait count does not match list`);
  }
  audits.set(slug, audit);
}

const rows = roster.map((platform) => {
  const audit = audits.get(platform.slug);
  return {
    ordinal: platform.ordinal,
    name: platform.name,
    slug: platform.slug,
    category: platform.category,
    status: audit?.audit_status ?? "pending",
    audited_at: audit?.audited_at ?? null,
    audit_url: audit ? `/data/audits/${platform.slug}.json` : null,
  };
});
const unknownAudits = [...audits.keys()].filter((slug) => !rows.some((row) => row.slug === slug));
if (unknownAudits.length) fail(`Audit files not present in roster: ${unknownAudits.join(", ")}`);

const summary = {
  schema_version: "1.0",
  generated_at: "2026-07-21",
  total: rows.length,
  verified: rows.filter((row) => row.status === "verified").length,
  blocked: rows.filter((row) => row.status === "blocked").length,
  needs_human_judgment: rows.filter((row) => row.status === "needs-human-judgment").length,
  pending: rows.filter((row) => row.status === "pending").length,
  records: rows,
};
const rendered = `${JSON.stringify(summary, null, 2)}\n`;

if (checkOnly) {
  const current = await readFile(statusPath, "utf8").catch(() => "");
  if (current !== rendered) fail("audit-status.json is stale; run npm run audit:paths");
} else {
  await writeFile(statusPath, rendered, "utf8");
}

console.log(`Shortest-path audits valid: ${summary.verified} verified, ${summary.needs_human_judgment} needs human judgment, ${summary.pending} pending.`);
