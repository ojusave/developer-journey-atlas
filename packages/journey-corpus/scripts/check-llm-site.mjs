import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const canonicalUrl = "https://devrelcon-research.onrender.com";

const requiredFiles = [
  "llms.txt",
  "llms-full.txt",
  "methodology.md",
  "measurement-contract.md",
  "catalog.md",
  "sitemap.xml",
  "data/index.json",
  "data/ds-quality.json",
  "data/coverage.json",
  "data/coverage-summary.json",
  "data/record.schema.json",
  "source/index.md",
];

for (const file of requiredFiles) {
  await readFile(path.join(publicRoot, file), "utf8");
}

const llms = await readFile(path.join(publicRoot, "llms.txt"), "utf8");
assert.match(llms, /^# First-Mile Atlas\n\n> /);
assert.match(llms, /## Source code/);
assert.match(llms, /no public reuse license is granted/i);

const links = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]);
assert.ok(links.length >= 15, "llms.txt should provide a curated set of useful links");
assert.ok(links.every((url) => url.startsWith("https://")), "llms.txt links must be absolute HTTPS URLs");

for (const url of links.filter((value) => value.startsWith(canonicalUrl))) {
  const urlPath = new URL(url).pathname.replace(/^\//, "") || "index.html";
  await readFile(path.join(publicRoot, urlPath), "utf8");
}

const manifest = JSON.parse(await readFile(path.join(publicRoot, "data/index.json"), "utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.records.length, 205);
assert.equal(manifest.counts.recordsWithErrors, 0);
assert.equal(manifest.sourceCode.license, null);
assert.equal(manifest.sourceCode.files.length, 14);
assert.match(manifest.interpretation.join(" "), /extracted from official docs/);
assert.match(manifest.interpretation.join(" "), /not a ranking/);
assert.doesNotMatch(manifest.interpretation.join(" "), /score/i);

for (const source of manifest.sourceCode.files) {
  const canonical = await readFile(path.join(projectRoot, source.path), "utf8");
  const published = await readFile(path.join(publicRoot, "source", source.path), "utf8");
  assert.equal(published, canonical, `${source.path} source snapshot should be byte-for-byte current`);
}

const fullContext = await readFile(path.join(publicRoot, "llms-full.txt"), "utf8");
assert.match(fullContext, /# Platform catalog/);
assert.match(fullContext, /# Canonical record schema/);
assert.match(fullContext, /# Deployed source code/);
assert.ok(fullContext.length > 100_000, "full context should contain the catalog, schema, and source");

const html = await readFile(path.join(publicRoot, "index.html"), "utf8");
assert.match(html, /rel="alternate" type="text\/plain"[^>]+\/llms\.txt/);
assert.match(html, /type="application\/ld\+json"/);
assert.match(html, /href="\/source\/index\.md">Source code/);

console.log(`Verified LLM index, ${manifest.records.length} records, and ${manifest.sourceCode.files.length} source files.`);
