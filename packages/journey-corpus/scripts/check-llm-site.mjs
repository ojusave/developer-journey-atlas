import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const canonicalUrl = "https://developer-journey-atlas.onrender.com";

const requiredFiles = [
  "llms.txt",
  "llms-full.txt",
  "methodology.md",
  "measurement-contract.md",
  "privacy.md",
  "event-contract.txt",
  "launch-checklist.txt",
  "sitemap.xml",
  "data/index.json",
  "data/coverage-summary.json",
  "data/record.schema.json",
  "data/records/render.json",
  "source/index.md",
  "source/web/index.html",
  "source/web/app.js",
  "source/web/styles.css",
  "source/src/server.ts",
];

for (const file of requiredFiles) {
  await readFile(path.join(publicRoot, file), "utf8");
}

const manifest = JSON.parse(await readFile(path.join(publicRoot, "data/index.json"), "utf8"));
assert.equal(manifest.schemaVersion, 2);
assert.equal(manifest.counts.reviewedCorpusRecords, 237);
assert.equal(manifest.counts.publicRoutes, 1);
assert.equal(manifest.counts.researchDrafts, 0);
assert.equal(manifest.counts.verifiedAudits, 0);
assert.equal(manifest.counts.publicAssociationsAvailable, false);
assert.equal(manifest.records.length, 1);
assert.equal(manifest.records[0].slug, "render");
assert.equal(manifest.servingModel.productUi, "packages/journey-corpus/web");
assert.equal(manifest.sourceCode.license, "Apache-2.0");

for (const source of manifest.sourceCode.files) {
  const canonical = await readFile(path.join(projectRoot, source.path), "utf8");
  const published = await readFile(path.join(publicRoot, "source", source.path), "utf8");
  assert.equal(published, canonical, `${source.path} source snapshot should be byte-for-byte current`);
}

const publicRecord = JSON.parse(await readFile(path.join(publicRoot, "data/records/render.json"), "utf8"));
const recordSchema = JSON.parse(await readFile(path.join(publicRoot, "data/record.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateRecord = ajv.compile(recordSchema);
assert.equal(validateRecord(publicRecord), true, JSON.stringify(validateRecord.errors));
assert.equal(publicRecord.primary_path.length, 16);
assert.equal(publicRecord.journey_graph.selectedRoute.nodeIds.length, 16);
assert.equal(publicRecord.prerequisites.length, publicRecord.journey_graph.prerequisites.length);
assert.equal(publicRecord.friction_gates.length, publicRecord.journey_graph.externalGates.length);
assert.equal(
  publicRecord.branches.length,
  publicRecord.journey_graph.candidateRoutes.filter((route) => route.status === "considered").length,
);
assert.equal(
  publicRecord.primary_path.flatMap((step) => step.required_fields || []).length,
  11,
);
const publicNodeIndex = new Map(
  publicRecord.journey_graph.selectedRoute.nodeIds.map((id, index) => [id, index + 1]),
);
for (const [index, gate] of publicRecord.journey_graph.externalGates.entries()) {
  assert.equal(publicRecord.friction_gates[index].at_step, publicNodeIndex.get(gate.atNodeId));
  assert.equal(publicRecord.friction_gates[index].required, gate.required);
}
assert.equal(
  publicRecord.friction_gates.some((gate) => /spin down after 15 minutes/i.test(gate.description)),
  false,
);
assert.ok(publicRecord.journey_graph.nodes.some((node) => node.kind === "passive_wait"));
assert.ok(publicRecord.journey_graph.nodes.some((node) => node.kind === "platform_outcome"));
assert.ok(publicRecord.journey_graph.nodes.some((node) => node.kind === "terminal_outcome"));

const serializedPublicData = JSON.stringify({ manifest, publicRecord });
for (const forbidden of [
  "onboardingScore",
  "effortScore",
  "peerMedian",
  "blockerHypotheses",
  "model_selected",
  "clientIp",
]) {
  assert.equal(serializedPublicData.includes(forbidden), false, `${forbidden} must not be serialized publicly`);
}

const app = await readFile(path.join(projectRoot, "web/app.js"), "utf8");
assert.doesNotMatch(app, /renderOnboardingScore|onboardingScore|curvePlacement|score-card|percentile|leaderboard/i);
assert.match(app, /Comparable peers/);
assert.match(app, /Open official starting point/);
assert.match(app, /View official evidence/);
assert.match(app, /Open route/);
assert.match(app, /setNotFoundMetadata/);
assert.match(app, /What counts as comparable\?/);
assert.match(app, /qualified peers are currently available/);
assert.match(app, /Start research/);
assert.match(app, /addEventListener\("click", \(\) => researchPlatform\(query\)\)/);
const consentBody = app.match(/function renderResearchConsent\(query\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.doesNotMatch(consentBody, /\n\s*researchPlatform\(query\);/);

const html = await readFile(path.join(projectRoot, "web/index.html"), "utf8");
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.match(html, /href="\/project-mark\.svg"/);
assert.doesNotMatch(html, /render\.com\/favicon/);
assert.match(html, /Independent community project, not an official Render product/);
assert.match(html, /Reviewed coverage: __PUBLIC_COVERAGE__/);
assert.match(html, /paid Render resources/i);
assert.match(html, /Starter web service and Basic-256mb Postgres/);
assert.match(html, /current Render pricing/);
assert.match(html, /Review and deploy a personal copy/);
const headerBody = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? "";
assert.doesNotMatch(headerBody, /render\.com\/deploy|deploy a personal copy/i);

const llms = await readFile(path.join(publicRoot, "llms.txt"), "utf8");
assert.match(llms, /^# Developer Journey Atlas\n\n> /);
assert.match(llms, /1 currently passes every publication gate/);
assert.match(llms, /measurement_unavailable/i);

const links = [...llms.matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]);
for (const url of links.filter((value) => value.startsWith(canonicalUrl))) {
  const urlPath = new URL(url).pathname.replace(/^\//, "");
  if (!urlPath || urlPath.startsWith("platform/")) continue;
  await readFile(path.join(publicRoot, urlPath), "utf8");
}

const sitemap = await readFile(path.join(publicRoot, "sitemap.xml"), "utf8");
assert.match(sitemap, /\/platform\/render/);
assert.equal((sitemap.match(/\/platform\//g) || []).length, 1);

const fullContext = await readFile(path.join(publicRoot, "llms-full.txt"), "utf8");
assert.match(fullContext, /# Deployed source/);
assert.match(fullContext, /function renderResearchConsent/);
assert.ok(fullContext.length > 50_000, "full context should contain public methodology, route, and deployed source");

console.log(
  `Verified ${manifest.records.length} public route, ${manifest.sourceCode.files.length} current source files, and the fail-closed generated contract.`,
);
