import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const corpusRoot = resolve(root, "packages/journey-corpus");
const recordsRoot = resolve(corpusRoot, "records");
const outputRoot = resolve(root, "packages/generated-views");
const catalogPath = resolve(root, "src/generated/catalog.json");
const manifestPath = resolve(root, "docs/migration/migration-manifest.json");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const md = (value) => compact(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
const list = (values, fallback = "None documented.") =>
  values.length ? values.map((value) => `- ${md(value)}`).join("\n") : fallback;

const manifest = await readJson(manifestPath);
const coverage = await readJson(resolve(corpusRoot, "coverage.json"));
const blockerCatalog = await readJson(catalogPath);
const recordFiles = (await readdir(recordsRoot))
  .filter((name) => name.endsWith(".json"))
  .sort((a, b) => a.localeCompare(b));

const records = await Promise.all(
  recordFiles.map(async (name) => ({ name, record: await readJson(resolve(recordsRoot, name)) })),
);

const seenPlatforms = new Set();
for (const { name, record } of records) {
  const slug = record.platform?.slug;
  if (!slug) throw new Error(`${name} has no platform slug`);
  if (seenPlatforms.has(slug)) throw new Error(`Duplicate platform slug: ${slug}`);
  seenPlatforms.add(slug);
}

const blockerNodes = blockerCatalog.nodes.filter((node) =>
  ["universal_family", "platform_archetype", "reason"].includes(node.kind),
);
const seenBlockers = new Set();
for (const node of blockerNodes) {
  if (seenBlockers.has(node.id)) throw new Error(`Duplicate blocker taxonomy ID: ${node.id}`);
  seenBlockers.add(node.id);
}

if (records.length !== manifest.sources.journeyCorpus.canonicalPlatformRecords) {
  // Keep the migration manifest in sync when the corpus grows intentionally.
  // Fail only when the count shrinks (unexpected deletion).
  if (records.length < manifest.sources.journeyCorpus.canonicalPlatformRecords) {
    throw new Error(
      `Platform record count shrank: ${records.length} < ${manifest.sources.journeyCorpus.canonicalPlatformRecords}`,
    );
  }
  manifest.sources.journeyCorpus.canonicalPlatformRecords = records.length;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
if (blockerCatalog.counts.reasons !== manifest.sources.blockerTaxonomy.blockerReasons) {
  throw new Error(`Blocker reason count changed: ${blockerCatalog.counts.reasons}`);
}

const interpretation = [
  "Platform records reconstruct official documentation. They do not contain product telemetry, conversion rates, observed completion times, or proven causes of abandonment.",
  "Friction gates are documented requirements or transitions. They are not confirmed drop-off points.",
  "Blocker taxonomy entries are candidate hypotheses. Individual reasons remain not diagnosis eligible unless separate case evidence supports them.",
  "A documented journey analysis is not a diagnosis of a real developer attempt.",
];

const journeyObjects = records.map(({ name, record }) => {
  const slug = record.platform.slug;
  const sourceIds = new Set(record.sources.map((source) => source.id));
  const validateRefs = (owner, refs) => {
    for (const id of refs ?? []) {
      if (!sourceIds.has(id)) throw new Error(`${slug} ${owner} references missing source ${id}`);
    }
  };
  validateRefs("first success", record.documented_first_success.source_ids);
  record.primary_path.forEach((step) => validateRefs(`step ${step.step_number}`, step.source_ids));
  record.friction_gates.forEach((gate, index) => validateRefs(`friction gate ${index + 1}`, gate.source_ids));
  record.uncertainties.forEach((item, index) => validateRefs(`uncertainty ${index + 1}`, item.checked_source_ids));

  return {
    recordType: "platform_journey",
    schemaVersion: 1,
    id: `journey:${slug}:documented-primary`,
    platformId: `platform:${slug}`,
    canonicalRecordPath: `packages/journey-corpus/records/${name}`,
    platform: record.platform,
    category: record.category,
    researchStatus: record.research_status,
    researchedAt: record.researched_at,
    evidenceState: record.research_status === "complete" ? "documented" : "unresolved",
    diagnosisEligibility: "documented_path_only",
    developerGoal: record.entry_point.developer_intent,
    entryPoint: record.entry_point,
    selectedSurface: record.surface,
    firstMeaningfulSuccess: record.documented_first_success,
    prerequisites: record.prerequisites,
    stages: record.primary_path,
    candidatePaths: record.candidate_paths,
    branches: record.branches,
    frictionGates: record.friction_gates,
    uncertainties: record.uncertainties,
    sources: record.sources,
    excludedAfterSuccess: record.excluded_after_success,
    doesNotProve: interpretation,
  };
});

const blockerObjects = blockerNodes.map((node) => ({
  recordType: node.kind === "reason" ? "blocker_hypothesis" : "blocker_group",
  schemaVersion: 1,
  id: `blocker:${node.id}`,
  canonicalId: node.id,
  canonicalRecordPath: "packages/blocker-taxonomy/first-mile-blocker-universe.md",
  sourceLine: node.sourceLine ?? null,
  kind: node.kind,
  title: node.label,
  parentId: node.parentId ? `blocker:${node.parentId}` : null,
  scope: node.scope ?? null,
  evidenceState: node.kind === "reason" ? "inferred" : "documented",
  diagnosisEligibility: node.diagnosticEligibility ?? null,
  doesNotProve: [
    "This taxonomy entry does not prove that the blocker occurred.",
    "Catalog membership does not establish frequency, severity, or causation.",
  ],
}));

const metadataObject = {
  recordType: "atlas_metadata",
  schemaVersion: 1,
  id: "atlas:developer-journey-atlas",
  productName: "Developer Journey Atlas",
  corpusCommit: manifest.sources.journeyCorpus.commit,
  blockerCommit: manifest.sources.blockerTaxonomy.originCommit,
  sourceSnapshotDate: coverage.generated_at,
  counts: {
    platformJourneys: journeyObjects.length,
    blockerReasons: blockerCatalog.counts.reasons,
    blockerFamilies: blockerCatalog.counts.universalFamilies,
    platformArchetypes: blockerCatalog.counts.platformArchetypes,
  },
  interpretation,
};

const jsonl = [metadataObject, ...journeyObjects, ...blockerObjects]
  .map((value) => JSON.stringify(value))
  .join("\n") + "\n";

const platformViews = journeyObjects.map((journey) => {
  const first = journey.firstMeaningfulSuccess;
  const stageLines = journey.stages.map((stage) =>
    `${stage.step_number}. ${md(stage.action)}${stage.success_signal ? ` Success signal: ${md(stage.success_signal)}` : ""} Sources: ${(stage.source_ids ?? []).join(", ")}.`,
  );
  const gateLines = journey.frictionGates.map((gate) =>
    `${md(gate.description)} Stage ${gate.at_step}. Evidence state: documented requirement. Sources: ${(gate.source_ids ?? []).join(", ")}.`,
  );
  const unknownLines = journey.uncertainties.map((item) =>
    `${md(item.question)} Why unresolved: ${md(item.reason_unresolved)} Next evidence needed: ${md(item.impact)}`,
  );
  const sourceLines = journey.sources.map((source) =>
    `[${source.id}] [${md(source.title)}](${source.url}), accessed ${source.accessed_at}.`,
  );
  const content = [
    `# ${md(journey.platform.name)} developer journey`,
    "",
    "> Generated from the canonical structured record. Do not edit this file directly.",
    "",
    `- Journey ID: \`${journey.id}\``,
    `- Research status: \`${journey.researchStatus}\``,
    `- Researched at: ${journey.researchedAt}`,
    `- Canonical record: \`${journey.canonicalRecordPath}\``,
    "",
    `**Developer goal:** ${md(journey.developerGoal)}`,
    "",
    `**Meaningful success:** ${md(first.normalized_outcome)}`,
    "",
    `**Evidence boundary:** ${md(first.boundary_evidence.type)}. ${md(first.why_this_is_the_boundary)}`,
    "",
    "## Documented path",
    "",
    ...stageLines,
    "",
    "## Documented friction gates",
    "",
    list(gateLines),
    "",
    "## Unknowns",
    "",
    list(unknownLines),
    "",
    "## Sources",
    "",
    ...sourceLines.map((line) => `- ${line}`),
    "",
    "## Evidence boundary",
    "",
    "This record does not prove usability, conversion, completion time, or why a real developer stopped.",
    "",
  ].join("\n");
  return { slug: journey.platform.slug, name: journey.platform.name, goal: journey.developerGoal, content };
});

const blockerHuman = [
  "# Developer Journey Atlas blocker hypothesis catalog",
  "",
  "> Generated from the canonical blocker taxonomy. Do not edit this file directly.",
  "",
  "Every item below is a candidate explanation, not a confirmed cause. Catalog membership does not establish frequency, severity, or causation.",
  "",
  ...blockerObjects.map((node) =>
    `- **${node.canonicalId}** ${md(node.title)}${node.parentId ? ` Parent: ${node.parentId.replace("blocker:", "")}.` : ""}${node.diagnosisEligibility ? ` Eligibility: ${node.diagnosisEligibility}.` : ""}`,
  ),
  "",
].join("\n");

const human = [
  "# Developer Journey Atlas",
  "",
  "> Generated from canonical structured records. Do not edit this file directly.",
  "",
  `- Schema version: 1`,
  `- Corpus commit: ${manifest.sources.journeyCorpus.commit}`,
  `- Blocker source commit: ${manifest.sources.blockerTaxonomy.originCommit}`,
  `- Source snapshot date: ${coverage.generated_at}`,
  `- Platforms: ${journeyObjects.length}`,
  `- Blocker hypotheses: ${blockerCatalog.counts.reasons}`,
  "",
  "## How to read this Atlas",
  "",
  ...interpretation.map((value) => `- ${value}`),
  "",
  "## Platform journeys",
  "",
  ...platformViews.flatMap((view) => [
    `- [${md(view.name)}](platforms/${view.slug}.md): ${md(view.goal)}`,
  ]),
  "",
  "## Blocker hypotheses",
  "",
  "See [the blocker hypothesis catalog](blockers.md).",
  "",
].join("\n");

const platformOutputRoot = resolve(outputRoot, "platforms");
await rm(platformOutputRoot, { recursive: true, force: true });
await mkdir(platformOutputRoot, { recursive: true });
const humanPath = resolve(outputRoot, "atlas.md");
const jsonlPath = resolve(outputRoot, "atlas.jsonl");
await writeFile(humanPath, human, "utf8");
await writeFile(jsonlPath, jsonl, "utf8");
await writeFile(resolve(outputRoot, "blockers.md"), blockerHuman, "utf8");
for (const view of platformViews) {
  await writeFile(resolve(platformOutputRoot, `${view.slug}.md`), view.content, "utf8");
}

const platformManifest = platformViews.map((view) => ({
  slug: view.slug,
  path: `packages/generated-views/platforms/${view.slug}.md`,
  sha256: sha256(view.content),
}));
const platformManifestHash = sha256(`${platformManifest.map((item) => `${item.path}:${item.sha256}`).join("\n")}\n`);

const index = {
  schemaVersion: 1,
  productName: "Developer Journey Atlas",
  generatedFromSourceSnapshot: coverage.generated_at,
  canonicalInputs: {
    journeyCorpus: "packages/journey-corpus/records/*.json",
    blockerTaxonomy: "packages/blocker-taxonomy/first-mile-blocker-universe.md",
  },
  generatedFiles: {
    human: { path: "packages/generated-views/atlas.md", sha256: sha256(human) },
    blockers: { path: "packages/generated-views/blockers.md", sha256: sha256(blockerHuman) },
    platforms: { count: platformManifest.length, manifestSha256: platformManifestHash, records: platformManifest },
    llm: { path: "packages/generated-views/atlas.jsonl", sha256: sha256(jsonl) },
  },
  counts: metadataObject.counts,
  interpretation,
};
await writeFile(resolve(outputRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  outputRoot,
  counts: index.counts,
  hashes: {
    human: index.generatedFiles.human.sha256,
    blockers: index.generatedFiles.blockers.sha256,
    platformManifest: index.generatedFiles.platforms.manifestSha256,
    llm: index.generatedFiles.llm.sha256,
  },
}, null, 2));
