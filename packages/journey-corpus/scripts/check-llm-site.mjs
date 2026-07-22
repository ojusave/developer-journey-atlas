import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const canonicalUrl = "https://developer-journey-atlas.onrender.com";

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
  "data/shortest-path-audit.schema.json",
  "data/audit-status.json",
  "data/audits/render.json",
  "data/audits/zoom.json",
  "source/index.md",
];

for (const file of requiredFiles) {
  await readFile(path.join(publicRoot, file), "utf8");
}

const llms = await readFile(path.join(publicRoot, "llms.txt"), "utf8");
assert.match(llms, /^# Developer Journey Atlas\n\n> /);
assert.match(llms, /## Source code/);
assert.match(llms, /Software is Apache-2.0 and original research is CC BY 4.0/i);

const links = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]);
assert.ok(links.length >= 15, "llms.txt should provide a curated set of useful links");
assert.ok(links.every((url) => url.startsWith("https://")), "llms.txt links must be absolute HTTPS URLs");

for (const url of links.filter((value) => value.startsWith(canonicalUrl))) {
  const urlPath = new URL(url).pathname.replace(/^\//, "") || "index.html";
  await readFile(path.join(publicRoot, urlPath), "utf8");
}

const manifest = JSON.parse(await readFile(path.join(publicRoot, "data/index.json"), "utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.ok(manifest.records.length >= 205);
assert.equal(manifest.counts.recordsWithErrors, 0);
assert.equal(manifest.sourceCode.license, "Apache-2.0");
assert.equal(manifest.sourceCode.files.length, 15);
assert.match(manifest.interpretation.join(" "), /source record is evidence/);
assert.match(manifest.interpretation.join(" "), /Only audits marked verified/);
assert.doesNotMatch(manifest.interpretation.join(" "), /score/i);

for (const source of manifest.sourceCode.files) {
  const canonical = await readFile(path.join(projectRoot, source.path), "utf8");
  const published = await readFile(path.join(publicRoot, "source", source.path), "utf8");
  assert.equal(published, canonical, `${source.path} source snapshot should be byte-for-byte current`);
}

const fullContext = await readFile(path.join(publicRoot, "llms-full.txt"), "utf8");
assert.match(fullContext, /# Corpus audit status/);
assert.match(fullContext, /# Verified Render shortest-path audit/);
assert.match(fullContext, /# Unresolved Zoom shortest-path audit/);
assert.match(fullContext, /# Audit catalog/);
assert.match(fullContext, /# Shortest-path audit schema/);
assert.match(fullContext, /# Preserved source-record schema/);
assert.match(fullContext, /# Deployed source code/);
assert.ok(fullContext.length > 100_000, "full context should contain the catalog, schema, and source");

const html = await readFile(path.join(publicRoot, "index.html"), "utf8");
assert.match(html, /rel="alternate" type="text\/plain"[^>]+\/llms\.txt/);
assert.match(html, /type="application\/ld\+json"/);
assert.match(html, /href="\/source\/index\.md">Source code/);

console.log(`Verified LLM index, ${manifest.records.length} records, and ${manifest.sourceCode.files.length} source files.`);
