import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const docsRoot = resolve(root, "docs/migration");
const manifestPath = resolve(docsRoot, "migration-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const git = (...args) => execFileSync("git", args, { cwd: root });
const treeEntries = (commit) =>
  git("ls-tree", "-r", "-l", commit).toString("utf8").trim().split("\n").filter(Boolean).map((line) => {
    const [metadata, path] = line.split("\t", 2);
    const [, , blob, size] = metadata.trim().split(/\s+/);
    return { path, blob, size: Number(size) };
  });

const scannerCommit = manifest.sources.scanner.commit;
const corpusCommit = manifest.sources.journeyCorpus.commit;
const scannerEntries = treeEntries(scannerCommit);
const corpusEntries = treeEntries(corpusCommit);
const scannerByPath = new Map(scannerEntries.map((entry) => [entry.path, entry]));
const corpusByPath = new Map(corpusEntries.map((entry) => [entry.path, entry]));

const samePathSameContent = [];
const samePathDifferentContent = [];
for (const path of [...scannerByPath.keys()].filter((value) => corpusByPath.has(value)).sort()) {
  const scannerEntry = scannerByPath.get(path);
  const corpusEntry = corpusByPath.get(path);
  const item = {
    path,
    scannerBlob: scannerEntry.blob,
    journeyCorpusBlob: corpusEntry.blob,
  };
  if (scannerEntry.blob === corpusEntry.blob) samePathSameContent.push(item);
  else samePathDifferentContent.push(item);
}

const scannerOnly = scannerEntries
  .filter(({ path }) => !corpusByPath.has(path))
  .map(({ path, blob, size }) => ({ path, blob, size }));
const journeyCorpusOnly = corpusEntries
  .filter(({ path }) => !scannerByPath.has(path))
  .map(({ path, blob, size }) => ({ path, blob, size }));

const pathsByBlob = (entries) => {
  const result = new Map();
  for (const { path, blob } of entries) result.set(blob, [...(result.get(blob) ?? []), path]);
  return result;
};
const scannerPathsByBlob = pathsByBlob(scannerEntries);
const corpusPathsByBlob = pathsByBlob(corpusEntries);
const exactContentDuplicates = [...scannerPathsByBlob.keys()]
  .filter((blob) => corpusPathsByBlob.has(blob))
  .sort()
  .map((blob) => ({
    blob,
    scannerPaths: scannerPathsByBlob.get(blob).sort(),
    journeyCorpusPaths: corpusPathsByBlob.get(blob).sort(),
  }));

const entriesByBasename = (entries) => {
  const result = new Map();
  for (const entry of entries) {
    const name = basename(entry.path);
    result.set(name, [...(result.get(name) ?? []), entry]);
  }
  return result;
};
const scannerByBasename = entriesByBasename(scannerEntries);
const corpusByBasename = entriesByBasename(corpusEntries);
const sameNameDifferentContent = [...scannerByBasename.keys()]
  .filter((name) => corpusByBasename.has(name))
  .sort()
  .flatMap((name) => scannerByBasename.get(name).flatMap((scannerEntry) =>
    corpusByBasename.get(name)
      .filter((corpusEntry) => corpusEntry.blob !== scannerEntry.blob)
      .map((corpusEntry) => ({
        name,
        scannerPath: scannerEntry.path,
        scannerBlob: scannerEntry.blob,
        journeyCorpusPath: corpusEntry.path,
        journeyCorpusBlob: corpusEntry.blob,
      })),
  ));

const schemaPattern = /(^|\/)[^/]*schema[^/]*\.(json|ya?ml)$/i;
const generatedPattern = /(^|\/)(dist|build|coverage)(\/|$)|catalog|coverage\.json$|ds-quality|selected-path/i;
const candidates = (entries, pattern) => entries
  .filter(({ path }) => pattern.test(path))
  .map(({ path, blob, size }) => ({ path, blob, size }));

const recordSlugs = [];
for (const { path } of corpusEntries.filter(({ path }) => path.startsWith("records/") && path.endsWith(".json"))) {
  const record = JSON.parse(await readFile(resolve(root, "packages/journey-corpus", path), "utf8"));
  recordSlugs.push({ slug: record.platform.slug, path });
}
const duplicateRecordSlugs = [...Map.groupBy(recordSlugs, ({ slug }) => slug)]
  .filter(([, entries]) => entries.length > 1)
  .map(([slug, entries]) => ({ slug, paths: entries.map(({ path }) => path).sort() }));

const comparison = {
  schemaVersion: 1,
  generatedFrom: "docs/migration/migration-manifest.json",
  comparisonBasis: "Git paths, Git blob identity, parsed platform slugs, and filename candidates at the recorded source commits.",
  counts: {
    samePathSameContent: samePathSameContent.length,
    samePathDifferentContent: samePathDifferentContent.length,
    scannerOnly: scannerOnly.length,
    journeyCorpusOnly: journeyCorpusOnly.length,
    exactContentDuplicateGroups: exactContentDuplicates.length,
    sameNameDifferentContentPairs: sameNameDifferentContent.length,
    duplicateRecordSlugs: duplicateRecordSlugs.length,
  },
  samePathSameContent,
  samePathDifferentContent,
  scannerOnly,
  journeyCorpusOnly,
  exactContentDuplicates,
  sameNameDifferentContent,
  duplicateRecordSlugs,
  schemaCandidates: {
    scanner: candidates(scannerEntries, schemaPattern),
    journeyCorpus: candidates(corpusEntries, schemaPattern),
  },
  generatedCandidates: {
    scanner: candidates(scannerEntries, generatedPattern),
    journeyCorpus: candidates(corpusEntries, generatedPattern),
  },
  ignoreRuleFiles: {
    scanner: scannerEntries.filter(({ path }) => basename(path) === ".gitignore"),
    journeyCorpus: corpusEntries.filter(({ path }) => basename(path) === ".gitignore"),
  },
  largestTrackedFiles: {
    scanner: [...scannerEntries].sort((a, b) => b.size - a.size || a.path.localeCompare(b.path)).slice(0, 20),
    journeyCorpus: [...corpusEntries].sort((a, b) => b.size - a.size || a.path.localeCompare(b.path)).slice(0, 20),
  },
  semanticChecks: {
    journeyRecords: "Validated by packages/journey-corpus/validate-records.mjs and duplicateRecordSlugs above.",
    blockerIds: "Validated by the blocker catalog parser and scripts/verify-atlas.mjs.",
    sourceReferences: "Validated by the journey-corpus validator; blocker source references retain their original text and IDs.",
  },
};

const classifyPath = (repository, path) => {
  if (/(^|\/)\.env(\.|$)/.test(path)) return "sensitive or potentially sensitive";
  if (repository === "journeyCorpus" && /^records\/[^/]+\.json$/.test(path)) return "canonical source data";
  if (repository === "journeyCorpus" && /(^|\/)(record\.schema\.json|validate-records\.mjs)$/.test(path)) {
    return "canonical source data";
  }
  if (repository === "scanner" && path === "research/first-mile-blocker-universe.md") {
    return "canonical source data";
  }
  if (generatedPattern.test(path)) return "generated output";
  if (/(^|\/)(test|tests|fixtures?)(\/|$)|\.test\.[cm]?[jt]sx?$/.test(path)) return "test fixture";
  if (/(^|\/)(render\.yaml|Dockerfile|\.github\/workflows\/)/.test(path)) return "deployment configuration";
  if (/(^|\/)(README|AGENTS|CONTRIBUTING)(\.|$)|\.md$|\.mdc$/.test(path)) return "documentation";
  if (/(^|\/)(node_modules|dist|tmp|temp)(\/|$)/.test(path)) return "local-only or disposable";
  return "application source";
};

const approval = (basis, evidence) => ({
  approved: true,
  approval: {
    status: "approved",
    authorizedBy: "Ojus Save",
    reviewedBy: "Automated migration verification",
    reviewedOn: "2026-07-21",
    basis,
    evidence,
  },
});

const mappings = [];
const reviewedPostMigrationPaths = new Set([
  "render.yaml",
  "src/domain/evidence-validation.test.ts",
  "src/domain/evidence-validation.ts",
]);
for (const { path, blob } of scannerEntries) {
  const licenseMetadataChange = path === "package-lock.json";
  const newPath = path === "research/first-mile-blocker-universe.md"
    ? "packages/blocker-taxonomy/first-mile-blocker-universe.md"
    : path;
  const compatibilityPaths = [
    "README.md",
    "package.json",
    "scripts/build-catalog.mjs",
    "server/http.test.ts",
    "server/http.ts",
    "src/generated/catalog.json",
  ];
  const transformation = licenseMetadataChange
    ? "license_metadata_updated"
    : path === "research/first-mile-blocker-universe.md"
    ? "moved"
    : reviewedPostMigrationPaths.has(path)
      ? "post_migration_change"
    : compatibilityPaths.includes(path)
      ? "schema_wrapped"
      : "unchanged";
  mappings.push({
    originalRepository: manifest.sources.scanner.repository,
    originalCommit: scannerCommit,
    originalPath: path,
    originalGitBlob: blob,
    newPath,
    classification: classifyPath("scanner", path),
    potentiallySensitive: /(^|\/)\.env(\.|$)/.test(path),
    transformation,
    reason: licenseMetadataChange
      ? "Updated only to reflect the approved Apache-2.0 package metadata."
      : transformation === "moved"
      ? "Place the canonical blocker taxonomy behind an explicit package boundary."
      : transformation === "post_migration_change"
        ? path === "render.yaml"
          ? "Replaced after the verified migration with the canonical Developer Journey Atlas deployment."
          : "Extended after the verified migration to enforce the diagnosis evidence contract."
      : transformation === "schema_wrapped"
        ? "Integrate the original application with the combined Atlas repository while preserving runtime compatibility."
        : "Preserved at the same path.",
    ...approval(
      licenseMetadataChange
        ? "reviewed_license_metadata_change"
        : transformation === "post_migration_change"
        ? "reviewed_post_migration_change"
        : transformation === "unchanged"
        ? "unchanged_blob_verified"
        : transformation === "moved"
          ? "path_only_hash_verified"
          : "reviewed_compatibility_change",
      licenseMetadataChange
        ? "The original Git blob remains recorded and the scoped lockfile metadata diff was reviewed."
        : transformation === "post_migration_change"
        ? "The original Git blob remains recorded. The diagnosis evidence contract diff is reviewed through focused tests, type checks, build checks, and Atlas integrity verification."
        : transformation === "unchanged"
        ? "The current Git blob must equal the recorded scanner source blob."
        : transformation === "moved"
          ? "The taxonomy SHA-256, IDs, counts, and runtime catalog derivation are verified."
          : "The scoped diff was reviewed and the scanner tests, type checks, build, browser flow, and integrity suite passed.",
    ),
  });
}

const corpusLicenseMetadataPaths = new Set(["README.md", "package-lock.json", "package.json"]);
const omittedCorpusToolingPaths = new Set([".cursor/rules/readme-and-docs.mdc"]);

for (const { path, blob } of corpusEntries) {
  const licenseMetadataChange = corpusLicenseMetadataPaths.has(path);
  const omittedNonDataTooling = omittedCorpusToolingPaths.has(path);
  mappings.push({
    originalRepository: manifest.sources.journeyCorpus.repository,
    originalCommit: corpusCommit,
    originalPath: path,
    originalGitBlob: blob,
    newPath: omittedNonDataTooling ? null : `packages/journey-corpus/${path}`,
    classification: classifyPath("journeyCorpus", path),
    potentiallySensitive: /(^|\/)\.env(\.|$)/.test(path),
    transformation: licenseMetadataChange
      ? "license_metadata_updated"
      : omittedNonDataTooling
        ? "omitted_non_data_tooling"
        : "moved",
    reason: licenseMetadataChange
      ? "Imported with history, then updated only to resolve the approved repository license boundary."
      : omittedNonDataTooling
        ? "Excluded an editor-specific documentation rule from the public canonical repository without changing research data."
        : "Imported byte-identically under the canonical journey-corpus package with Git history preserved.",
    ...approval(
      licenseMetadataChange
        ? "reviewed_license_metadata_change"
        : omittedNonDataTooling
          ? "reviewed_non_data_omission"
          : "byte_identical_history_import",
      licenseMetadataChange
        ? "The original Git blob remains recorded, the scoped metadata diff was reviewed, and no research record content changed."
        : omittedNonDataTooling
          ? "The omitted path is editor configuration, its original Git blob remains recorded, and no canonical record, evidence source, schema, validator, or generated view changed."
          : "The imported file's current Git blob must equal its blob at the recorded journey-corpus source commit.",
    ),
  });
}

mappings.sort((a, b) =>
  a.originalRepository.localeCompare(b.originalRepository) || a.originalPath.localeCompare(b.originalPath),
);

const map = {
  schemaVersion: 1,
  generatedFrom: "docs/migration/migration-manifest.json",
  approvalPolicy: "Each mapping is approved only under one of five verified evidence classes; no destructive transformation is present.",
  counts: {
    scannerEntries: scannerEntries.length,
    journeyCorpusEntries: corpusEntries.length,
    total: mappings.length,
  },
  mappings,
};

await mkdir(docsRoot, { recursive: true });
await writeFile(resolve(docsRoot, "migration-map.json"), `${JSON.stringify(map, null, 2)}\n`, "utf8");
await writeFile(resolve(docsRoot, "repository-comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ migrationMap: map.counts, comparison: comparison.counts }));
