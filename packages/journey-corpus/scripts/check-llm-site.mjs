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
  "data/llm-api-catalog.json",
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
assert.match(manifest.files.llmApiCatalog, /\/data\/llm-api-catalog\.json$/);

const llmCatalog = JSON.parse(await readFile(path.join(publicRoot, "data/llm-api-catalog.json"), "utf8"));
const launchCohortPlan = JSON.parse(
  await readFile(path.join(projectRoot, "trust", "launch-cohort-candidates.json"), "utf8"),
);
const llmCohortIds = new Set([
  "llm-api-first-response",
  "managed-llm-inference-first-response",
  "cloud-llm-platform-first-response",
]);
const plannedLlmCohorts = launchCohortPlan.cohorts.filter((cohort) => llmCohortIds.has(cohort.id));
const plannedCountByCohort = new Map(
  plannedLlmCohorts.map((cohort) => [cohort.id, cohort.participant_slugs.length]),
);
const catalogProviders = llmCatalog.cohorts.flatMap((cohort) => cohort.providers);
assert.equal(llmCatalog.schemaVersion, 1);
assert.equal(llmCatalog.providerCount, catalogProviders.length);
assert.equal(llmCatalog.cohorts.length, plannedLlmCohorts.length);
for (const cohort of llmCatalog.cohorts) {
  assert.equal(cohort.providers.length, plannedCountByCohort.get(cohort.id));
}
assert.equal(
  new Set(catalogProviders.map((provider) => provider.slug)).size,
  llmCatalog.providerCount,
);
assert.ok(catalogProviders.every(
  (provider) => provider.routeStatus === "published"
    ? provider.routeUrl === `${canonicalUrl}/platform/${provider.slug}`
    : provider.routeStatus === "review_in_progress" && provider.routeUrl === null,
));
assert.ok(catalogProviders.every(
  (provider) => Array.isArray(provider.searchAliases),
));
const providerBySlug = new Map(
  catalogProviders.map((provider) => [provider.slug, provider]),
);
assert.ok(providerBySlug.get("xai-api").searchAliases.includes("Grok"));
assert.ok(providerBySlug.get("amazon-bedrock").searchAliases.includes("AWS"));

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
assert.match(app, /Open official guide/);
assert.match(app, /Official sources/);
assert.match(app, /Domain comparison/);
assert.match(app, /Complexity/);
assert.match(app, /setNotFoundMetadata/);
assert.match(app, /Not mapped yet/);
assert.match(app, /Build path from docs/);
assert.match(app, /Draft failed validation/);
assert.match(app, /Try again/);
assert.doesNotMatch(app, /Could not build a reliable path/);
assert.match(app, /draft_ready/);
assert.match(app, /renderResearchDraft/);
assert.doesNotMatch(app, /Research stopped safely|draft did not pass the required record schema/i);
assert.match(app, /Start research/);
assert.match(app, /Build path from docs/);
assert.match(app, /addEventListener\("click", \(\) => researchPlatform\(name\)\)/);
const consentBody = app.match(/function renderResearchOffer\(name, slug = "", provider = null\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.doesNotMatch(consentBody, /\n\s*researchPlatform\(name\);/);

const html = await readFile(path.join(projectRoot, "web/index.html"), "utf8");
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.match(html, /href="\/project-mark\.svg"/);
assert.doesNotMatch(html, /render\.com\/favicon/);
assert.doesNotMatch(html, /Independent project/);
assert.match(html, /Search a platform\. See the first mile\./);
assert.match(html, /steps, fields, gates, and official sources/);
assert.match(html, /placeholder="OpenAI, Stripe, GitHub, Render\.\.\."/);
assert.match(html, /src="\/app\.js\?v=20260727-plain-list"/);
assert.match(html, /href="\/styles\.css\?v=20260727-plain-list"/);
assert.doesNotMatch(html, /corpus records currently publish/i);
assert.doesNotMatch(html, /Provider directory|Why these groups|Catalog scope|paid Render resources/i);
const headerBody = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? "";
assert.doesNotMatch(headerBody, /render\.com\/deploy|deploy a personal copy/i);

const llms = await readFile(path.join(publicRoot, "llms.txt"), "utf8");
assert.match(llms, /^# Developer Journey Atlas\n\n> /);
assert.match(llms, /1 currently passes every publication gate/);
assert.match(llms, /Search covers the whole reviewed corpus/);
assert.match(llms, /LLM APIs are one cohort inside the Atlas/);
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
assert.match(fullContext, /function renderResearchOffer/);
assert.ok(fullContext.length > 50_000, "full context should contain public methodology, route, and deployed source");

console.log(
  `Verified ${manifest.records.length} public route, ${manifest.sourceCode.files.length} current source files, and the fail-closed generated contract.`,
);
