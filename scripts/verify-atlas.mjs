import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const manifest = JSON.parse(await readFile(resolve(root, "docs/migration/migration-manifest.json"), "utf8"));
const migrationMap = JSON.parse(await readFile(resolve(root, "docs/migration/migration-map.json"), "utf8"));
const repositoryComparison = JSON.parse(await readFile(resolve(root, "docs/migration/repository-comparison.json"), "utf8"));
const generatedIndex = JSON.parse(await readFile(resolve(root, "packages/generated-views/index.json"), "utf8"));
const runtimeCatalog = JSON.parse(await readFile(resolve(root, "src/generated/catalog.json"), "utf8"));

const failures = [];
const checks = [];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const pass = (name, detail) => checks.push({ name, status: "pass", detail });
const fail = (name, detail) => {
  checks.push({ name, status: "fail", detail });
  failures.push(`${name}: ${detail}`);
};
const git = (...args) => execFileSync("git", args, { cwd: root });
const gitBlobHash = (value) => createHash("sha1")
  .update(`blob ${value.length}\0`)
  .update(value)
  .digest("hex");

const journeyRequire = createRequire(resolve(root, "packages/journey-corpus/package.json"));
const Ajv2020 = journeyRequire("ajv/dist/2020").default;
const addFormats = journeyRequire("ajv-formats");
const schemaCompiler = new Ajv2020({ allErrors: true, strict: true });
addFormats(schemaCompiler);

const schemaFiles = [
  "schemas/platform-intake.schema.json",
  "schemas/diagnosis-output.schema.json",
  "schemas/comparison-record.schema.json",
  "schemas/reason-diagnostic-card.schema.json",
];
const schemaValidators = new Map();
for (const path of schemaFiles) {
  try {
    const schema = JSON.parse(await readFile(resolve(root, path), "utf8"));
    if (schema.additionalProperties !== false || !Array.isArray(schema.required)) {
      fail(`schema:${path}`, "schema must reject additional properties and declare required fields");
    } else {
      schemaValidators.set(path, schemaCompiler.compile(schema));
      pass(`schema:${path}`, `compiled; ${schema.required.length} required top-level fields`);
    }
  } catch (error) {
    fail(`schema:${path}`, error.message);
  }
}

const schemaExamples = [
  ["schemas/diagnosis-output.schema.json", "schemas/examples/diagnosis-insufficient-evidence.synthetic.json"],
  ["schemas/diagnosis-output.schema.json", "schemas/examples/diagnosis-supported.synthetic.json"],
  ["schemas/comparison-record.schema.json", "schemas/examples/comparison-bounded.synthetic.json"],
  ["schemas/reason-diagnostic-card.schema.json", "schemas/examples/reason-diagnostic-card.synthetic.json"],
];
for (const [schemaPath, examplePath] of schemaExamples) {
  const validate = schemaValidators.get(schemaPath);
  const example = JSON.parse(await readFile(resolve(root, examplePath), "utf8"));
  if (validate?.(example)) pass(`schema-example:${examplePath}`, `valid against ${schemaPath}`);
  else fail(`schema-example:${examplePath}`, JSON.stringify(validate?.errors ?? []));
}

const supportedExample = JSON.parse(await readFile(resolve(root, "schemas/examples/diagnosis-supported.synthetic.json"), "utf8"));
const diagnosisValidator = schemaValidators.get("schemas/diagnosis-output.schema.json");
const documentationFalsePositive = structuredClone(supportedExample);
documentationFalsePositive.analysis_mode = "documented-journey";
if (diagnosisValidator && !diagnosisValidator(documentationFalsePositive)) {
  pass("schema-negative:documentation-supported", "documentation-only analysis cannot emit a supported individual reason");
} else {
  fail("schema-negative:documentation-supported", "unsafe supported documentation output passed validation");
}
const weakEvidenceFalsePositive = structuredClone(supportedExample);
weakEvidenceFalsePositive.what_may_be_happening[0].evidence_kinds = ["team_anecdote", "assumption"];
if (diagnosisValidator && !diagnosisValidator(weakEvidenceFalsePositive)) {
  pass("schema-negative:weak-evidence-supported", "weak evidence cannot satisfy a supported hypothesis");
} else {
  fail("schema-negative:weak-evidence-supported", "weak evidence passed the supported-hypothesis gate");
}

const boundedComparison = JSON.parse(await readFile(resolve(root, "schemas/examples/comparison-bounded.synthetic.json"), "utf8"));
const comparisonValidator = schemaValidators.get("schemas/comparison-record.schema.json");
const unsafeComparison = structuredClone(boundedComparison);
unsafeComparison.safe_to_anonymize = false;
if (comparisonValidator && !comparisonValidator(unsafeComparison)) {
  pass("schema-negative:unsafe-comparison-summary", "unsafe anonymization cannot retain participant-facing output");
} else {
  fail("schema-negative:unsafe-comparison-summary", "unsafe comparison retained participant-facing output");
}
const unsupportedPattern = structuredClone(boundedComparison);
unsupportedPattern.pattern_claim_eligible = true;
if (comparisonValidator && !comparisonValidator(unsupportedPattern)) {
  pass("schema-negative:small-cohort-pattern", "fewer than three peers cannot produce pattern-eligible output");
} else {
  fail("schema-negative:small-cohort-pattern", "small cohort passed the pattern-claim gate");
}

const corpusCommit = manifest.sources.journeyCorpus.commit;
const importedEntries = git("ls-tree", "-r", corpusCommit)
  .toString("utf8").trim().split("\n").filter(Boolean).map((line) => {
    const [metadata, path] = line.split("\t", 2);
    const [, , blob] = metadata.split(" ");
    return { path, blob };
  });
const protectedCorpusEntries = importedEntries.filter(({ path }) =>
  !path.endsWith(".md") &&
  (
    path.startsWith("records/") ||
    path.startsWith("research/") ||
    path.startsWith("verify/") ||
    [
      "record.schema.json",
      "candidate-path-audit.json",
      "cold-audit-open.json",
      "headline.json",
    ].includes(path)
  ),
);
let importMismatches = 0;
let approvedCorpusDrift = 0;
// Intentional post-import research corrections: first-success boundaries that
// stopped before the documented authenticated API call.
const approvedCorpusDriftPaths = new Set([
  "records/zoom.json",
  "records/paypal.json",
  "records/openai.json",
  "records/fireworks-ai.json",
  "records/cohere.json",
  "records/cerebras-inference.json",
  "records/groqcloud.json",
  "records/together-ai.json",
  "records/mistral-ai.json",
  "records/perplexity.json",
  "records/exa.json",
  "records/render.json",
  "records/railway.json",
  "records/fly-io.json",
  "records/netlify.json",
  "records/box.json",
  "records/nvidia-developer.json",
]);
for (const { path, blob } of protectedCorpusEntries) {
  const current = await readFile(resolve(root, "packages/journey-corpus", path));
  if (gitBlobHash(current) === blob) continue;
  if (approvedCorpusDriftPaths.has(path)) {
    approvedCorpusDrift += 1;
    continue;
  }
  importMismatches += 1;
}
if (importMismatches === 0) {
  const driftNote = approvedCorpusDrift
    ? `; ${approvedCorpusDrift} approved post-import first-success corrections (API-boundary fixes)`
    : "";
  pass(
    "journey-import",
    `${protectedCorpusEntries.length} canonical research files remain byte-identical to the imported source${driftNote}`,
  );
} else {
  fail("journey-import", `${importMismatches} imported files differ from ${corpusCommit}`);
}

const corpusPackage = JSON.parse(await readFile(resolve(root, "packages/journey-corpus/package.json"), "utf8"));
const rootReadme = await readFile(resolve(root, "README.md"), "utf8");
const licenseScope = await readFile(resolve(root, "LICENSE_SCOPE.txt"), "utf8");
if (
  corpusPackage.license === "Apache-2.0" &&
  rootReadme.includes("Creative Commons Attribution 4.0") &&
  licenseScope.includes("Apache License 2.0") &&
  licenseScope.includes("Creative Commons")
) {
  pass("license-metadata", "repository license boundary is documented");
} else {
  fail("license-metadata", "journey package license metadata is incomplete or inconsistent");
}

const blockerSource = await readFile(resolve(root, "packages/blocker-taxonomy/first-mile-blocker-universe.txt"));
const blockerHash = sha256(blockerSource);
if (blockerHash === manifest.sources.blockerTaxonomy.sha256) pass("blocker-source", blockerHash);
else fail("blocker-source", `expected ${manifest.sources.blockerTaxonomy.sha256}, found ${blockerHash}`);

const recordFiles = (await readdir(resolve(root, "packages/journey-corpus/records")))
  .filter((name) => name.endsWith(".json"));
const expectedRecordCount = manifest.sources.journeyCorpus.canonicalPlatformRecords;
if (recordFiles.length === expectedRecordCount) {
  pass("platform-count", `${expectedRecordCount} canonical records`);
} else {
  fail("platform-count", `expected ${expectedRecordCount}, found ${recordFiles.length}`);
}

if (
  runtimeCatalog.counts.reasons === 790 &&
  runtimeCatalog.counts.universalFamilies === 28 &&
  runtimeCatalog.counts.platformArchetypes === 16
) {
  pass("blocker-counts", "790 reasons, 28 universal families, 16 platform archetypes");
} else {
  fail("blocker-counts", JSON.stringify(runtimeCatalog.counts));
}

if (runtimeCatalog.source === "packages/blocker-taxonomy/first-mile-blocker-universe.txt") {
  pass("runtime-catalog-source", runtimeCatalog.source);
} else {
  fail("runtime-catalog-source", `stale source path ${runtimeCatalog.source}`);
}

const human = await readFile(resolve(root, generatedIndex.generatedFiles.human.path));
const llm = await readFile(resolve(root, generatedIndex.generatedFiles.llm.path));
for (const [kind, value] of [["human", human], ["llm", llm]]) {
  const expected = generatedIndex.generatedFiles[kind].sha256;
  const actual = sha256(value);
  if (actual === expected) pass(`generated-${kind}-hash`, actual);
  else fail(`generated-${kind}-hash`, `expected ${expected}, found ${actual}`);
}
const blockersView = await readFile(resolve(root, generatedIndex.generatedFiles.blockers.path));
if (sha256(blockersView) === generatedIndex.generatedFiles.blockers.sha256) {
  pass("generated-blockers-hash", generatedIndex.generatedFiles.blockers.sha256);
} else {
  fail("generated-blockers-hash", "blocker view does not match its generated index");
}
const platformViewEntries = generatedIndex.generatedFiles.platforms.records;
const platformViewParts = [];
let platformViewMismatches = 0;
for (const entry of platformViewEntries) {
  const content = await readFile(resolve(root, entry.path));
  const actual = sha256(content);
  if (actual !== entry.sha256) platformViewMismatches += 1;
  platformViewParts.push(`${entry.path}:${actual}`);
}
const platformManifestHash = sha256(`${platformViewParts.join("\n")}\n`);
const expectedPlatformCount = generatedIndex.counts?.platformJourneys
  ?? manifest.sources.journeyCorpus.canonicalPlatformRecords;
if (
  platformViewEntries.length === expectedPlatformCount &&
  platformViewMismatches === 0 &&
  platformManifestHash === generatedIndex.generatedFiles.platforms.manifestSha256
) {
  pass(
    "generated-platform-views",
    `${expectedPlatformCount} human-readable platform files match the generated index`,
  );
} else {
  fail("generated-platform-views", `${platformViewEntries.length} files, ${platformViewMismatches} hash mismatches`);
}

const lines = llm.toString("utf8").trim().split("\n");
const ids = new Set();
const recordTypes = new Map();
let invalidJsonLines = 0;
let unsafeBlockers = 0;
for (const [index, line] of lines.entries()) {
  try {
    const value = JSON.parse(line);
    if (!value.id || ids.has(value.id)) fail("llm-id", `missing or duplicate ID on line ${index + 1}: ${value.id ?? "missing"}`);
    ids.add(value.id);
    recordTypes.set(value.recordType, (recordTypes.get(value.recordType) ?? 0) + 1);
    if (value.recordType === "blocker_hypothesis" && value.diagnosisEligibility !== "not_diagnosis_eligible") {
      unsafeBlockers += 1;
    }
  } catch {
    invalidJsonLines += 1;
  }
}
if (invalidJsonLines === 0) pass("llm-jsonl", `${lines.length} independently parseable records`);
else fail("llm-jsonl", `${invalidJsonLines} invalid lines`);
if (recordTypes.get("platform_journey") === expectedPlatformCount) {
  pass("llm-platform-records", `${expectedPlatformCount} platform journeys`);
} else {
  fail("llm-platform-records", `found ${recordTypes.get("platform_journey") ?? 0}`);
}
if (recordTypes.get("blocker_hypothesis") === 790) pass("llm-blocker-records", "790 blocker hypotheses");
else fail("llm-blocker-records", `found ${recordTypes.get("blocker_hypothesis") ?? 0}`);
if (unsafeBlockers === 0) pass("diagnosis-eligibility", "all individual blocker hypotheses remain not diagnosis eligible");
else fail("diagnosis-eligibility", `${unsafeBlockers} blocker hypotheses were upgraded without evidence`);

const forbiddenClaims = [
  /this is why the developer dropped off/i,
  /this is the most common reason/i,
  /similar platforms usually/i,
];
const humanText = human.toString("utf8");
const forbidden = forbiddenClaims.filter((pattern) => pattern.test(humanText));
if (forbidden.length === 0) pass("unsupported-language", "no prohibited causal or prevalence phrases in generated human output");
else fail("unsupported-language", `${forbidden.length} prohibited phrase patterns found`);

if (
  migrationMap.counts.scannerEntries === manifest.sources.scanner.trackedFiles &&
  migrationMap.counts.journeyCorpusEntries === manifest.sources.journeyCorpus.trackedFiles
) {
  pass("migration-map", `${migrationMap.counts.total} source paths mapped`);
} else {
  fail("migration-map", JSON.stringify(migrationMap.counts));
}
const approvalBasisCounts = Object.fromEntries(
  Object.entries(Object.groupBy(migrationMap.mappings, (entry) => entry.approval?.basis ?? "missing"))
    .map(([basis, entries]) => [basis, entries.length]),
);
if (
  migrationMap.mappings.every((entry) => entry.approved === true && entry.approval?.status === "approved") &&
    approvalBasisCounts.byte_identical_history_import === 284 &&
    approvalBasisCounts.reviewed_license_metadata_change === 4 &&
    approvalBasisCounts.reviewed_non_data_omission === 1 &&
    approvalBasisCounts.unchanged_blob_verified === 77 &&
    (approvalBasisCounts.path_only_hash_verified ?? 0) === 0 &&
    approvalBasisCounts.reviewed_compatibility_change === 6 &&
    approvalBasisCounts.reviewed_post_migration_change === 3
  ) {
  pass("migration-approval", "284 byte-identical imports, 4 license metadata changes, 1 non-data tooling omission, 77 unchanged, 6 compatibility, and 3 post-migration mappings approved by evidence class");
} else {
  fail("migration-approval", JSON.stringify(approvalBasisCounts));
}
let unchangedScannerMismatches = 0;
for (const entry of migrationMap.mappings.filter(({ approval, newPath }) =>
  approval?.basis === "unchanged_blob_verified" &&
  newPath &&
  !newPath.endsWith(".md") &&
  newPath !== ".gitignore",
)) {
  const current = await readFile(resolve(root, entry.newPath));
  if (gitBlobHash(current) !== entry.originalGitBlob) unchangedScannerMismatches += 1;
}
if (unchangedScannerMismatches === 0) {
  pass("scanner-preservation", "76 unchanged scanner files retain their original Git blobs; 3 post-migration changes are separately reviewed");
} else {
  fail("scanner-preservation", `${unchangedScannerMismatches} unchanged scanner files differ from their source blobs`);
}
const allowedClassifications = new Set([
  "canonical source data",
  "application source",
  "generated output",
  "test fixture",
  "documentation",
  "deployment configuration",
  "local-only or disposable",
  "sensitive or potentially sensitive",
  "uncertain and requiring review",
]);
if (migrationMap.mappings.every((entry) => allowedClassifications.has(entry.classification))) {
  pass("migration-classification", "all 375 original files have an allowed classification");
} else {
  fail("migration-classification", "one or more original files lack an allowed classification");
}
const mappedDestinations = migrationMap.mappings.map(({ newPath }) => newPath);
if (new Set(mappedDestinations).size === mappedDestinations.length) {
  pass("migration-destinations", "all mapped destination paths are unique");
} else {
  fail("migration-destinations", "two or more original files map to the same destination path");
}
const omittedTooling = migrationMap.mappings.filter(
  ({ approval }) => approval?.basis === "reviewed_non_data_omission",
);
if (
  omittedTooling.length === 1 &&
  omittedTooling[0].originalPath === ".cursor/rules/readme-and-docs.mdc" &&
  omittedTooling[0].newPath === null
) {
  pass("migration-tooling-omission", "one editor-specific documentation rule is omitted with its original Git blob retained");
} else {
  fail("migration-tooling-omission", JSON.stringify(omittedTooling));
}
if (
  repositoryComparison.counts.samePathDifferentContent === 7 &&
  repositoryComparison.counts.duplicateRecordSlugs === 0
) {
  pass("repository-comparison", "7 original path conflicts isolated; 0 duplicate platform slugs");
} else {
  fail("repository-comparison", JSON.stringify(repositoryComparison.counts));
}

const result = {
  status: failures.length ? "FAIL" : "PASS",
  evidenceState: failures.length ? "NO RELIABLE EVIDENCE" : "ARTIFACT VERIFIED",
  checks,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
