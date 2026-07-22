#!/usr/bin/env node
/**
 * Ingest a machine-drafted research record into the corpus as:
 *   - records/<slug>.json
 *   - audits/<slug>.json (needs-human-judgment, counts withheld)
 *   - roster.json entry
 *
 * Usage:
 *   node scripts/ingest-research-draft.mjs path/to/record.json
 *   node scripts/ingest-research-draft.mjs --from-dir path/to/drafts/
 *
 * Does not rebuild generated site artifacts; run `npm run build:data` after a batch.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordsDir = path.join(projectRoot, "records");
const auditsDir = path.join(projectRoot, "audits");
const rosterPath = path.join(projectRoot, "roster.json");

const INTERFACE_MAP = {
  browser: "browser",
  "web-ui": "web-ui",
  web: "web-ui",
  email: "email",
  cli: "cli",
  terminal: "cli",
  code: "code",
  ide: "ide",
  api: "api",
  sdk: "sdk",
  "external-system": "external-system",
  other: "other",
};

const KIND_MAP = {
  arrive: "account",
  account: "account",
  signup: "account",
  auth: "account",
  configure: "product-interaction",
  product: "product-interaction",
  implement: "implementation",
  implementation: "implementation",
  verify: "verification",
  verification: "verification",
  call: "implementation",
};

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function mapInterface(value) {
  const key = String(value || "other").toLowerCase();
  return INTERFACE_MAP[key] || "other";
}

function mapKind(step) {
  const phase = String(step.phase || "").toLowerCase();
  if (KIND_MAP[phase]) return KIND_MAP[phase];
  const action = String(step.action || "").toLowerCase();
  if (/sign\s*up|create.*account|register/.test(action)) return "account";
  if (/auth|oauth|login|token/.test(action)) return "account";
  if (/verify|confirm/.test(action)) return "verification";
  return "implementation";
}

function sourceIds(step, fallback) {
  const ids = Array.isArray(step.source_ids) && step.source_ids.length ? step.source_ids : fallback;
  return [...new Set(ids)];
}

function asText(value, fallback) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    if (typeof value.name === "string" && value.name.trim()) return value.name.trim();
    if (typeof value.label === "string" && value.label.trim()) return value.label.trim();
    if (typeof value.title === "string" && value.title.trim()) return value.title.trim();
  }
  return fallback;
}

function buildAudit(record, recordText) {
  const slug = record.platform.slug;
  const name = record.platform.name;
  const category = record.category;
  const sources = (record.sources || []).map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    source_type: "official-documentation",
    accessed_at: record.researched_at || today(),
    evidence_supported: [
      source.title || "Official documentation",
      ...(Array.isArray(source.sections_used) ? source.sections_used.slice(0, 3) : []),
    ].filter(Boolean).slice(0, 6),
  }));
  if (sources.length === 0) {
    throw new Error(`${slug}: record has no sources`);
  }
  const fallbackIds = [sources[0].id];
  const dfs = record.documented_first_success || {};
  const pathSteps = (record.primary_path || []).filter((step) => step.required !== false);
  const requiredPath = pathSteps.map((step, index) => {
    const ids = sourceIds(step, fallbackIds);
    return {
      step_number: index + 1,
      kind: mapKind(step),
      interface: mapInterface(step.interface),
      action: step.action,
      required_fields: [
        {
          label: step.input ? String(step.input).slice(0, 120) : "Documented required input",
          field_type: "other",
          evidence_state: "unverified",
          source_ids: ids,
          notes: "Mapped from machine-drafted primary_path; field inventory not independently audited.",
        },
      ],
      observable_result: step.success_signal || step.output || "Documented step completion signal.",
      evidence_state: "unverified",
      source_ids: ids,
    };
  });

  if (requiredPath.length === 0) {
    requiredPath.push({
      step_number: 1,
      kind: "account",
      interface: "web-ui",
      action: "Create or sign in to a developer account and reach the documented first-success surface.",
      required_fields: [
        {
          label: "Account credentials",
          field_type: "other",
          evidence_state: "unverified",
          source_ids: fallbackIds,
          notes: "Machine draft did not emit a primary_path; placeholder until human audit.",
        },
      ],
      observable_result: dfs.observable_completion_signal || "Documented first-success signal.",
      evidence_state: "unverified",
      source_ids: fallbackIds,
    });
  }

  const uncertainties = (record.uncertainties || []).map((item) => ({
    question: item.question,
    impact: item.impact,
    evidence_needed: item.reason_unresolved || item.evidence_needed || "Independent shortest-path review of current official docs.",
  }));
  uncertainties.push({
    question: `Has the machine-drafted ${name} route been independently shortest-path audited?`,
    impact: "Action counts and peer comparison must stay withheld until a human audit passes.",
    evidence_needed: "Complete a shortest-path audit against current official docs and mark verified only when evidence supports it.",
  });

  const surfaceName = asText(record.surface, "Machine-drafted official-docs route");
  const candidates = [];
  for (const candidate of record.candidate_paths || []) {
    candidates.push({
      name: asText(candidate, "Candidate route"),
      status: "unresolved",
      reason: asText(candidate.reason, "Present in the machine draft; not selected by an independent shortest-path audit."),
    });
  }
  const alts = record.surface && typeof record.surface === "object" ? record.surface.alternatives_considered : null;
  if (Array.isArray(alts)) {
    for (const alt of alts) {
      candidates.push({
        name: asText(alt, "Alternative surface"),
        status: "unresolved",
        reason: asText(alt.reason_not_primary, "Listed as an alternative surface in the machine draft."),
      });
    }
  }
  if (candidates.length === 0) {
    candidates.push({
      name: surfaceName,
      status: "unresolved",
      reason: "Machine-drafted primary path only; not confirmed as the lexicographic shortest required route.",
    });
  }

  return {
    schema_version: "1.0",
    platform: { name, slug, category },
    audit_status: "needs-human-judgment",
    audited_at: today(),
    source_record_sha256: sha256(recordText),
    starting_state: {
      boundary: "account creation",
      assumptions: [
        "The developer has a supported browser and can receive email when the selected route requires it.",
        "No platform account, tenant, credentials, or product resources exist yet.",
        ...(record.entry_point?.assumed_prior_state || []).slice(0, 2).map((item) => String(item)),
      ],
    },
    developer_goal:
      record.entry_point?.developer_intent ||
      dfs.normalized_outcome ||
      `Reach the documented first success for ${name}.`,
    first_success: {
      outcome: dfs.normalized_outcome || dfs.official_milestone || `Documented first success for ${name}.`,
      observable_signal: dfs.observable_completion_signal || "Documented completion signal from official docs.",
      source_ids: sourceIds(dfs, fallbackIds),
    },
    route_selection: {
      surface: surfaceName,
      rule: "Reconstruct complete official candidate routes, prefer no payment/admin/approval when possible, then minimize required actions; leave consequential ties unresolved.",
      selected: null,
      candidates,
    },
    required_path: requiredPath,
    prerequisites: (record.prerequisites || [])
      .filter((item) => item.required !== false)
      .map((item) => ({
        description: item.requirement || item.description || "Documented prerequisite",
        source_ids: sourceIds(item, fallbackIds),
      })),
    external_gates: (record.friction_gates || []).map((gate) => ({
      description: gate.description || gate.type || "Documented friction gate",
      source_ids: sourceIds(gate, fallbackIds),
    })),
    unavoidable_waits: [],
    platform_outcomes: [
      {
        description: dfs.official_milestone || dfs.normalized_outcome || "Documented platform first-success outcome.",
        source_ids: sourceIds(dfs, fallbackIds),
      },
    ],
    excluded: (record.excluded_after_success || []).map((item) => ({
      item: asText(item.item || item.description, "Excluded work"),
      reason: asText(item.reason, "Listed as after-success or optional in the machine draft."),
      source_ids: sourceIds(item, fallbackIds),
    })),
    sources,
    uncertainties,
    counts: null,
  };
}

async function ingestRecordFile(filePath) {
  const record = JSON.parse(await readFile(filePath, "utf8"));
  const slug = record.platform?.slug;
  if (!slug) throw new Error(`${filePath}: missing platform.slug`);

  // Normalize common machine-draft quirks before hashing/audit generation.
  const ttfs = record.time_to_first_success;
  if (!ttfs || ttfs.vendor_claim !== true) {
    record.time_to_first_success = { vendor_claim: false, value: "not documented", source_ids: [] };
  }

  const recordText = `${JSON.stringify(record, null, 2)}\n`;
  const audit = buildAudit(record, recordText);

  await mkdir(recordsDir, { recursive: true });
  await mkdir(auditsDir, { recursive: true });
  await writeFile(path.join(recordsDir, `${slug}.json`), recordText);
  await writeFile(path.join(auditsDir, `${slug}.json`), `${JSON.stringify(audit, null, 2)}\n`);

  const roster = JSON.parse(await readFile(rosterPath, "utf8"));
  if (!roster.some((row) => row.slug === slug)) {
    roster.push({
      ordinal: roster.length + 1,
      name: record.platform.name,
      slug,
      category: record.category,
    });
    // Keep ordinals contiguous after append order; do not reshuffle existing order.
    roster.forEach((row, index) => {
      row.ordinal = index + 1;
    });
    await writeFile(rosterPath, `${JSON.stringify(roster, null, 2)}\n`);
  }

  return { slug, name: record.platform.name, rosterCount: roster.length };
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/ingest-research-draft.mjs <record.json> | --from-dir <dir>");
  process.exit(1);
}

const results = [];
if (args[0] === "--from-dir") {
  const dir = args[1];
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".json") && !name.includes("summary"))
    .sort();
  for (const name of files) {
    results.push(await ingestRecordFile(path.join(dir, name)));
  }
} else {
  for (const file of args) {
    results.push(await ingestRecordFile(path.resolve(file)));
  }
}

for (const row of results) {
  console.log(`ingested ${row.slug} (${row.name}); roster now ${row.rosterCount}`);
}
