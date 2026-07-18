import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const base = path.dirname(new URL(import.meta.url).pathname);
const roster = JSON.parse(fs.readFileSync(path.join(base, "roster.json"), "utf8"));
const recordSchema = JSON.parse(fs.readFileSync(path.join(base, "record.schema.json"), "utf8"));
const candidatePathAudit = JSON.parse(fs.readFileSync(path.join(base, "candidate-path-audit.json"), "utf8"));
const candidatePathRequiredOrGap = new Set(candidatePathAudit.slugs);
const coldAuditOpen = JSON.parse(fs.readFileSync(path.join(base, "cold-audit-open.json"), "utf8"));
const coldAuditOpenSlugs = new Set(coldAuditOpen.slugs);
const recordsDir = path.join(base, "records");

const requiredTopLevel = [
  "platform", "category", "surface", "research_status", "researched_at",
  "official_docs_only", "entry_point", "documented_first_success",
  "prerequisites", "primary_path", "candidate_paths", "candidate_path_gap", "branches", "friction_gates",
  "time_to_first_success", "sources", "uncertainties", "excluded_after_success"
];
const allowedStatuses = new Set(["complete", "blocked", "needs-human-judgment"]);
const sourcePattern = /^S[1-9][0-9]*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveLocalRef(ref) {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported schema reference: ${ref}`);
  return ref.slice(2).split("/").reduce((node, token) => node[token.replaceAll("~1", "/").replaceAll("~0", "~")], recordSchema);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function schemaErrors(value, schema, owner = "record") {
  if (schema.$ref) return schemaErrors(value, resolveLocalRef(schema.$ref), owner);
  if (schema.oneOf) {
    const alternatives = schema.oneOf.map((candidate) => schemaErrors(value, candidate, owner));
    if (alternatives.filter((errors) => errors.length === 0).length !== 1) return [`${owner} does not match exactly one allowed schema shape`];
    return [];
  }

  const errors = [];
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${owner} must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) errors.push(`${owner} has a value outside the allowed enum`);

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = valueType(value);
    const numberMatches = allowedTypes.includes("number") && (actualType === "integer" || actualType === "number");
    if (!allowedTypes.includes(actualType) && !numberMatches) {
      errors.push(`${owner} must be ${allowedTypes.join(" or ")}, got ${actualType}`);
      return errors;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${owner} is shorter than ${schema.minLength}`);
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${owner} does not match ${schema.pattern}`);
    if (schema.format === "date" && !datePattern.test(value)) errors.push(`${owner} must be YYYY-MM-DD`);
    if (schema.format === "uri") {
      try {
        new URL(value);
      } catch {
        errors.push(`${owner} must be a URI`);
      }
    }
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) errors.push(`${owner} must be at least ${schema.minimum}`);

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${owner} must contain at least ${schema.minItems} item(s)`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${owner} must contain unique items`);
    if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, `${owner}[${index}]`)));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${owner} is missing required field ${key}`);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${owner} has unexpected field ${key}`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...schemaErrors(value[key], childSchema, `${owner}.${key}`));
    }
  }
  return errors;
}

function sourceRefs(record) {
  const refs = [];
  const add = (owner, ids) => {
    if (!Array.isArray(ids)) {
      refs.push({owner, id: null, invalidContainer: true});
      return;
    }
    for (const id of ids) refs.push({owner, id});
  };
  add("documented_first_success", record.documented_first_success?.source_ids);
  add("documented_first_success.boundary_evidence", record.documented_first_success?.boundary_evidence?.source_ids);
  asArray(record.prerequisites).forEach((item, index) => add(`prerequisites[${index}]`, item.source_ids));
  asArray(record.primary_path).forEach((item, index) => add(`primary_path[${index}]`, item.source_ids));
  asArray(record.candidate_paths).forEach((candidate, candidateIndex) => {
    add(`candidate_paths[${candidateIndex}]`, candidate.source_ids);
    asArray(candidate.steps).forEach((item, stepIndex) => {
      add(`candidate_paths[${candidateIndex}].steps[${stepIndex}]`, item.source_ids);
    });
  });
  if (record.candidate_path_gap !== null && record.candidate_path_gap !== undefined) {
    add("candidate_path_gap", record.candidate_path_gap.source_ids);
  }
  asArray(record.branches).forEach((item, index) => add(`branches[${index}]`, item.source_ids));
  asArray(record.friction_gates).forEach((item, index) => add(`friction_gates[${index}]`, item.source_ids));
  add("time_to_first_success", record.time_to_first_success?.source_ids);
  asArray(record.uncertainties).forEach((item, index) => add(`uncertainties[${index}]`, item.checked_source_ids));
  return refs;
}

function validateRecord(entry, file) {
  const errors = [];
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return {slug: entry.slug, status: "invalid", errors: [`Invalid JSON: ${error.message}`]};
  }

  errors.push(...schemaErrors(record, recordSchema));

  for (const key of requiredTopLevel) {
    if (!(key in record)) errors.push(`Missing top-level field: ${key}`);
  }
  const extras = Object.keys(record).filter((key) => !requiredTopLevel.includes(key));
  if (extras.length) errors.push(`Unexpected top-level fields: ${extras.join(", ")}`);

  if (record.platform?.name !== entry.name) errors.push(`Platform name does not match roster: ${record.platform?.name ?? "missing"}`);
  if (record.platform?.slug !== entry.slug) errors.push(`Platform slug does not match roster: ${record.platform?.slug ?? "missing"}`);
  if (record.category !== entry.category) errors.push(`Category does not match roster: ${record.category ?? "missing"}`);
  if (!record.platform?.organization?.trim()) errors.push("Missing platform organization");
  if (!record.surface?.name?.trim()) errors.push("Missing selected surface name");
  if (!record.surface?.selection_basis?.trim()) errors.push("Missing surface selection basis");
  if (!Array.isArray(record.surface?.alternatives_considered)) errors.push("surface.alternatives_considered must be an array");
  if (!allowedStatuses.has(record.research_status)) errors.push(`Invalid research_status: ${record.research_status}`);
  if (!datePattern.test(record.researched_at ?? "")) errors.push("researched_at must be YYYY-MM-DD");
  if (record.official_docs_only !== true) errors.push("official_docs_only must be true");
  if (!record.entry_point?.developer_intent?.trim()) errors.push("Missing entry developer intent");
  if (!/^https:\/\//.test(record.entry_point?.starting_url ?? "")) errors.push("entry_point.starting_url must be HTTPS");

  const success = record.documented_first_success ?? {};
  for (const key of ["official_milestone", "normalized_outcome", "observable_completion_signal", "why_this_is_the_boundary"]) {
    if (!success[key]?.trim()) errors.push(`Missing documented_first_success.${key}`);
  }
  if (!["explicitly-named", "demonstrated-terminal-state", "not-established-by-docs"].includes(success.boundary_evidence?.type)) {
    errors.push("documented_first_success.boundary_evidence.type is invalid");
  }
  if (record.research_status === "complete" && success.boundary_evidence?.type === "not-established-by-docs") {
    errors.push("A complete record cannot use boundary_evidence.type not-established-by-docs");
  }
  if (!success.boundary_evidence?.official_label_or_terminal_state?.trim()) {
    errors.push("Missing documented_first_success.boundary_evidence.official_label_or_terminal_state");
  }
  if (!Array.isArray(success.boundary_evidence?.source_ids) || success.boundary_evidence.source_ids.length === 0) {
    errors.push("Documented success boundary has no source IDs");
  }

  for (const key of ["prerequisites", "primary_path", "candidate_paths", "branches", "friction_gates", "sources", "uncertainties", "excluded_after_success"]) {
    if (!Array.isArray(record[key])) errors.push(`${key} must be an array`);
  }
  if (record.research_status === "complete" && asArray(record.primary_path).length === 0) errors.push("Complete record has no primary path");
  if (asArray(record.sources).length === 0) errors.push("Record has no sources");

  const sourceIds = new Set();
  asArray(record.sources).forEach((source, index) => {
    const owner = `sources[${index}]`;
    if (!sourcePattern.test(source.id ?? "")) errors.push(`${owner}.id is invalid`);
    if (sourceIds.has(source.id)) errors.push(`Duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
    if (!source.title?.trim()) errors.push(`${owner}.title is missing`);
    if (!/^https:\/\//.test(source.url ?? "")) errors.push(`${owner}.url must be HTTPS`);
    if (source.official_domain !== true) errors.push(`${owner}.official_domain must be true`);
    if (!datePattern.test(source.accessed_at ?? "")) errors.push(`${owner}.accessed_at must be YYYY-MM-DD`);
    if (!Array.isArray(source.sections_used)) errors.push(`${owner}.sections_used must be an array`);
    if (!Array.isArray(source.evidence_supported) || source.evidence_supported.length === 0) errors.push(`${owner}.evidence_supported must be a non-empty array`);
  });

  for (const ref of sourceRefs(record)) {
    if (ref.invalidContainer) {
      errors.push(`${ref.owner}.source_ids must be an array`);
    } else if (!sourcePattern.test(ref.id ?? "")) {
      errors.push(`${ref.owner} has invalid source id: ${String(ref.id)}`);
    } else if (!sourceIds.has(ref.id)) {
      errors.push(`${ref.owner} references missing source id: ${ref.id}`);
    }
  }

  asArray(record.prerequisites).forEach((item, index) => {
    if (item.order !== index + 1) errors.push(`prerequisites[${index}].order must equal ${index + 1}`);
    if (!item.requirement?.trim()) errors.push(`prerequisites[${index}].requirement is missing`);
    if (!Array.isArray(item.source_ids) || item.source_ids.length === 0) errors.push(`prerequisites[${index}] has no source IDs`);
  });
  asArray(record.primary_path).forEach((step, index) => {
    if (step.step_number !== index + 1) errors.push(`primary_path[${index}].step_number must equal ${index + 1}`);
    if (!step.action?.trim()) errors.push(`primary_path[${index}].action is missing`);
    if (!Array.isArray(step.details)) errors.push(`primary_path[${index}].details must be an array`);
    if (!Array.isArray(step.source_ids) || step.source_ids.length === 0) errors.push(`primary_path[${index}] has no source IDs`);
  });
  const candidateIds = new Set();
  asArray(record.candidate_paths).forEach((candidate, candidateIndex) => {
    const owner = `candidate_paths[${candidateIndex}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.id ?? "")) errors.push(`${owner}.id is invalid`);
    if (candidateIds.has(candidate.id)) errors.push(`Duplicate candidate path id: ${candidate.id}`);
    candidateIds.add(candidate.id);
    if (!candidate.name?.trim()) errors.push(`${owner}.name is missing`);
    if (!candidate.selection_basis?.trim()) errors.push(`${owner}.selection_basis is missing`);
    if (!candidate.relationship_to_primary_path?.trim()) errors.push(`${owner}.relationship_to_primary_path is missing`);
    if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) errors.push(`${owner}.steps must be a non-empty array`);
    if (!Array.isArray(candidate.source_ids) || candidate.source_ids.length === 0) errors.push(`${owner} has no source IDs`);
    asArray(candidate.steps).forEach((step, stepIndex) => {
      if (step.step_number !== stepIndex + 1) errors.push(`${owner}.steps[${stepIndex}].step_number must equal ${stepIndex + 1}`);
      if (!step.action?.trim()) errors.push(`${owner}.steps[${stepIndex}].action is missing`);
      if (!Array.isArray(step.details)) errors.push(`${owner}.steps[${stepIndex}].details must be an array`);
      if (!Array.isArray(step.source_ids) || step.source_ids.length === 0) errors.push(`${owner}.steps[${stepIndex}] has no source IDs`);
    });
  });
  if (record.candidate_path_gap !== null && (typeof record.candidate_path_gap !== "object" || Array.isArray(record.candidate_path_gap))) {
    errors.push("candidate_path_gap must be null or an object");
  }
  if (record.candidate_path_gap && !record.candidate_path_gap.reason?.trim()) errors.push("candidate_path_gap.reason is missing");
  if (record.candidate_path_gap && !record.candidate_path_gap.impact?.trim()) errors.push("candidate_path_gap.impact is missing");
  if (record.candidate_path_gap && (!Array.isArray(record.candidate_path_gap.source_ids) || record.candidate_path_gap.source_ids.length === 0)) {
    errors.push("candidate_path_gap has no source IDs");
  }
  if (record.candidate_path_gap && record.research_status === "complete") {
    errors.push("A complete record cannot declare candidate_path_gap");
  }
  if (record.candidate_path_gap && asArray(record.uncertainties).length === 0) {
    errors.push("candidate_path_gap requires at least one uncertainty");
  }
  if (record.candidate_path_gap && asArray(record.candidate_paths).length > 0) {
    errors.push("candidate_path_gap must be null when candidate_paths are present");
  }
  if (candidatePathRequiredOrGap.has(entry.slug) && asArray(record.candidate_paths).length === 0 && !record.candidate_path_gap) {
    errors.push("Cold audit requires a complete atomic candidate_path or a source-backed candidate_path_gap");
  }
  if (coldAuditOpenSlugs.has(entry.slug)) {
    errors.push("Open independent cold-audit discrepancy requires rework and recheck");
  }
  asArray(record.friction_gates).forEach((gate, index) => {
    if (!Number.isInteger(gate.at_step) || gate.at_step < 1 || gate.at_step > asArray(record.primary_path).length) {
      errors.push(`friction_gates[${index}].at_step is outside the primary path`);
    }
    if (!Array.isArray(gate.source_ids) || gate.source_ids.length === 0) errors.push(`friction_gates[${index}] has no source IDs`);
  });

  const time = record.time_to_first_success ?? {};
  if (typeof time.vendor_claim !== "boolean") errors.push("time_to_first_success.vendor_claim must be boolean");
  if (!time.value?.trim()) errors.push("time_to_first_success.value is missing");
  if (time.vendor_claim === false && time.value !== "not documented") errors.push("Unclaimed time must be exactly 'not documented'");
  if (time.vendor_claim === false && asArray(time.source_ids).length !== 0) errors.push("Unclaimed time must not cite source IDs");
  if (time.vendor_claim === true && asArray(time.source_ids).length === 0) errors.push("Vendor time claim requires source IDs");

  return {
    slug: entry.slug,
    status: errors.length ? "invalid" : record.research_status,
    errors,
    steps: asArray(record.primary_path).length + asArray(record.candidate_paths).reduce((sum, candidate) => sum + asArray(candidate.steps).length, 0),
    sources: asArray(record.sources).length,
    surface: record.surface?.name ?? "",
    outcome: success.normalized_outcome ?? ""
  };
}

const slugArgIndex = process.argv.indexOf("--slug");
const requestedSlug = slugArgIndex >= 0 ? process.argv[slugArgIndex + 1] : null;
if (slugArgIndex >= 0 && !requestedSlug) {
  console.error("--slug requires a roster slug");
  process.exit(2);
}
const selectedRoster = requestedSlug ? roster.filter((entry) => entry.slug === requestedSlug) : roster;
if (requestedSlug && selectedRoster.length === 0) {
  console.error(`Unknown roster slug: ${requestedSlug}`);
  process.exit(2);
}

const results = [];
for (const entry of selectedRoster) {
  const file = path.join(recordsDir, `${entry.slug}.json`);
  if (!fs.existsSync(file)) {
    results.push({slug: entry.slug, status: "missing", errors: ["Record file is missing"]});
    continue;
  }
  results.push(validateRecord(entry, file));
}

const unexpected = requestedSlug ? [] : fs.readdirSync(recordsDir)
  .filter((name) => name.endsWith(".json"))
  .filter((name) => !roster.some((entry) => `${entry.slug}.json` === name));
const counts = results.reduce((acc, result) => {
  acc[result.status] = (acc[result.status] ?? 0) + 1;
  return acc;
}, {});
const coverage = {
  generated_at: new Date().toISOString(),
  roster_count: selectedRoster.length,
  counts,
  unexpected_record_files: unexpected,
  records: results
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(base, "coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
}

console.log(JSON.stringify(coverage, null, 2));
if ((counts.invalid ?? 0) > 0 || unexpected.length > 0) process.exitCode = 1;
