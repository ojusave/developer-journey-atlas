import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "public");
const dataRoot = path.join(outputRoot, "data");
const recordsRoot = path.join(dataRoot, "records");
const sourceRoot = path.join(outputRoot, "source");
const canonicalUrl = process.env.PUBLIC_BASE_URL ?? "https://developer-journey-atlas.onrender.com";

const sourceFiles = [
  { path: "web/index.html", language: "html", description: "The active product document served before generated artifacts." },
  { path: "web/app.js", language: "javascript", description: "Search, durable routing, explicit research consent, sharing, and route rendering." },
  { path: "web/styles.css", language: "css", description: "The active responsive and accessible visual system." },
  { path: "src/server.ts", language: "typescript", description: "The deployed Express composition root and platform-page metadata route." },
  { path: "src/api/router.ts", language: "typescript", description: "The complete public API route index." },
  { path: "src/api/platforms.ts", language: "typescript", description: "Fail-closed platform list and route presenter." },
  { path: "src/api/journey.ts", language: "typescript", description: "Selected journey graph presenter with public blocker links suppressed." },
  { path: "src/api/research.ts", language: "typescript", description: "Explicit research start and private review projection." },
  { path: "src/core/publicationGate.ts", language: "typescript", description: "Identity, source, claim, and route publication gate." },
  { path: "src/core/sourceAuthority.ts", language: "typescript", description: "Deterministic first-party source authority checks." },
  { path: "src/core/journeyGraph.ts", language: "typescript", description: "Typed journey graph and selected-route integrity checks." },
  { path: "scripts/build-corpus-health.mjs", language: "javascript", description: "Machine-readable corpus health and migration analysis generator." },
  { path: "scripts/build-site.mjs", language: "javascript", description: "Fail-closed machine artifact and source snapshot generator." },
  { path: "scripts/check-llm-site.mjs", language: "javascript", description: "Generated public-surface contract check." },
  { path: "PRIVACY.md", language: "markdown", description: "Provider, storage, retention, and deletion disclosure." },
  { path: "EVENT-CONTRACT.txt", language: "text", description: "Uninstrumented privacy-preserving event contract." },
  { path: "LAUNCH-CHECKLIST.txt", language: "text", description: "Human review and representative-user pilot gate." },
  { path: "package.json", language: "json", description: "Supported build, audit, evaluation, and test commands." },
];

function sourceUrl(filePath) {
  return `${canonicalUrl}/source/${filePath}`;
}

function fencedCode(language, content) {
  const runs = [...content.matchAll(/`+/g)].map((match) => match[0].length);
  const fence = "`".repeat(Math.max(3, ...runs.map((length) => length + 1)));
  return `${fence}${language}\n${content.trimEnd()}\n${fence}`;
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(recordsRoot, { recursive: true });
await mkdir(sourceRoot, { recursive: true });
await cp(path.join(projectRoot, "site", "robots.txt"), path.join(outputRoot, "robots.txt"));

const coverage = JSON.parse(await readFile(path.join(projectRoot, "coverage.json"), "utf8"));
const health = JSON.parse(await readFile(path.join(projectRoot, "corpus-health.json"), "utf8"));
const atlas = JSON.parse(await readFile(path.join(projectRoot, "selected-path-heuristic.json"), "utf8"));
const auditStatus = JSON.parse(await readFile(path.join(projectRoot, "audit-status.json"), "utf8"));
const launchCohortPlan = JSON.parse(
  await readFile(path.join(projectRoot, "trust", "launch-cohort-candidates.json"), "utf8"),
);
const eligibleSlugs = new Set(
  health.records
    .filter((record) => record.eligibility.public_display)
    .map((record) => record.slug),
);
const eligibleRows = atlas.rows.filter((row) => eligibleSlugs.has(row.slug));
const rowBySlug = new Map(atlas.rows.map((row) => [row.slug, row]));

const llmCohortCopy = {
  "llm-api-first-response": {
    label: "Direct model APIs",
    shortLabel: "Model provider",
    description:
      "APIs operated by model providers. These routes start with a new provider account and end when an authenticated request returns model output.",
  },
  "managed-llm-inference-first-response": {
    label: "Inference and routing",
    shortLabel: "Inference or router",
    description:
      "Hosted services that run or route models. Model selection, routing, and the service provider remain visible in the review.",
  },
  "cloud-llm-platform-first-response": {
    label: "Cloud platforms",
    shortLabel: "Cloud platform",
    description:
      "Model APIs inside cloud or data platforms. Their reviews include the surrounding account, billing, project, region, and access setup.",
  },
};

const llmProviderSearchAliases = {
  "google-gemini-api": ["Google", "Gemini"],
  "xai-api": ["xAI", "Grok"],
  "groqcloud": ["Groq", "GroqCloud"],
  "hugging-face": ["Hugging Face", "HF"],
  "nvidia-developer": ["NVIDIA", "NIM"],
  "cloudflare-workers-ai": ["Cloudflare", "Workers AI"],
  "amazon-bedrock": ["Amazon", "AWS", "Bedrock"],
  "microsoft-foundry": ["Microsoft", "Azure", "Azure AI Foundry"],
  "google-vertex-ai": ["Google", "GCP", "Vertex AI"],
  "ibm-watsonx-ai": ["IBM", "watsonx"],
  "oracle-generative-ai": ["Oracle", "OCI"],
  "databricks-foundation-model-api": ["Databricks"],
  "snowflake-cortex-ai": ["Snowflake", "Cortex"],
};

const llmCohorts = launchCohortPlan.cohorts
  .filter((cohort) => llmCohortCopy[cohort.id])
  .map((cohort) => {
    const copy = llmCohortCopy[cohort.id];
    return {
      id: cohort.id,
      label: copy.label,
      shortLabel: copy.shortLabel,
      description: copy.description,
      providers: cohort.participant_slugs.map((slug) => {
        const row = rowBySlug.get(slug);
        if (!row) throw new Error(`LLM API catalog references missing platform "${slug}".`);
        const routePublished = eligibleSlugs.has(slug);
        return {
          name: row.name,
          slug: row.slug,
          cohortId: cohort.id,
          cohortLabel: copy.label,
          providerType: copy.shortLabel,
          searchAliases: llmProviderSearchAliases[row.slug] ?? [],
          routeStatus: routePublished ? "published" : "review_in_progress",
          routeUrl: routePublished ? `${canonicalUrl}/platform/${row.slug}` : null,
        };
      }),
    };
  });

const llmProviderSlugs = llmCohorts.flatMap((cohort) => cohort.providers.map((provider) => provider.slug));
const expectedLlmProviderCount = launchCohortPlan.cohorts
  .filter((cohort) => llmCohortCopy[cohort.id])
  .reduce((count, cohort) => count + cohort.participant_slugs.length, 0);
if (
  llmProviderSlugs.length !== expectedLlmProviderCount
  || new Set(llmProviderSlugs).size !== expectedLlmProviderCount
) {
  throw new Error(
    `Expected ${expectedLlmProviderCount} unique LLM API providers, found ${llmProviderSlugs.length}.`,
  );
}

const llmApiCatalog = {
  schemaVersion: 1,
  name: "LLM API research catalog",
  description:
    "A maintained inventory of currently documented LLM API providers, grouped by setup model. Catalog membership is not route verification or comparison certification.",
  generatedAt: coverage.generated_at,
  providerCount: llmProviderSlugs.length,
  routeReviewStatus: "in_progress",
  cohorts: llmCohorts,
};
await writeFile(
  path.join(dataRoot, "llm-api-catalog.json"),
  `${JSON.stringify(llmApiCatalog, null, 2)}\n`,
  "utf8",
);

function publicRecordFromGraph(record, graph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes = graph.selectedRoute.nodeIds.map((id) => nodeById.get(id)).filter(Boolean);
  const stepNumberByNodeId = new Map(nodes.map((node, index) => [node.id, index + 1]));
  const prerequisites = graph.prerequisites.map((item, index) => ({
    order: index + 1,
    type: item.type,
    requirement: item.requirement,
    required: item.required,
    source_ids: [...new Set(item.evidence.map((evidence) => evidence.sourceId))],
  }));
  const frictionGates = graph.externalGates.map((gate) => ({
    at_step: stepNumberByNodeId.get(gate.atNodeId),
    type: gate.type,
    description: gate.description,
    documented_requirement: true,
    required: gate.required,
    source_ids: [...new Set(gate.evidence.map((evidence) => evidence.sourceId))],
  }));
  const branches = graph.candidateRoutes
    .filter((candidate) => candidate.status === "considered")
    .map((candidate) => ({
      at_step: stepNumberByNodeId.get(candidate.branchAtNodeId),
      condition: candidate.condition,
      path: candidate.routeSummary,
      effect_on_first_success: candidate.effectOnFirstSuccess,
      source_ids: [...new Set(candidate.evidence.map((evidence) => evidence.sourceId))],
    }));
  return {
    ...record,
    prerequisites,
    primary_path: nodes.map((node, index) => ({
      step_number: index + 1,
      phase: node.phase,
      actor: node.actor,
      interface: node.interface,
      action: node.action,
      details: [],
      input: node.inputs.join(", "),
      output: node.outputs.join(", "),
      success_signal: node.successSignal,
      failure_or_wait: node.kind === "passive_wait" ? node.action : "",
      required: node.required,
      source_ids: [...new Set(node.evidence.map((evidence) => evidence.sourceId))],
      required_fields: node.requiredFields,
    })),
    branches,
    friction_gates: frictionGates,
    journey_graph: graph,
  };
}

const publicRecords = new Map();
for (const row of eligibleRows) {
  const record = JSON.parse(await readFile(path.join(projectRoot, "records", `${row.slug}.json`), "utf8"));
  const graph = JSON.parse(
    await readFile(path.join(projectRoot, "trust", "journey-graphs", `${row.slug}.json`), "utf8"),
  );
  const publicRecord = publicRecordFromGraph(record, graph);
  publicRecords.set(row.slug, publicRecord);
  await writeFile(
    path.join(recordsRoot, `${row.slug}.json`),
    `${JSON.stringify(publicRecord, null, 2)}\n`,
    "utf8",
  );
}
await cp(path.join(projectRoot, "record.schema.json"), path.join(dataRoot, "record.schema.json"));

const summary = {
  generatedAt: coverage.generated_at,
  reviewedCorpusRecords: coverage.roster_count,
  publicRoutes: eligibleRows.length,
  researchDrafts: 0,
  verifiedAudits: auditStatus.verified,
  blockerLinkEvaluation: "awaiting independent labels",
  publicAssociationsAvailable: false,
};
await writeFile(
  path.join(dataRoot, "coverage-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

const records = eligibleRows.map((row) => ({
  name: row.name,
  slug: row.slug,
  category: row.category,
  outcome: row.outcome,
  platformUrl: `${canonicalUrl}/platform/${row.slug}`,
  recordUrl: `${canonicalUrl}/data/records/${row.slug}.json`,
  evidenceClass: "documented_fact",
}));
const dataIndex = {
  schemaVersion: 2,
  name: "Developer Journey Atlas",
  description:
    "Publication-eligible documented routes from account creation to first success. Documentation structure is not user behavior or product quality.",
  canonicalUrl,
  generatedAt: coverage.generated_at,
  servingModel: {
    productUi: "packages/journey-corpus/web",
    machineArtifacts: "packages/journey-corpus/public",
    note: "Generated artifacts never shadow or describe a second frontend.",
  },
  counts: summary,
  publicationContract: [
    "Every public route passes deterministic platform identity, source authority, content availability, claim coverage, and selected-route integrity gates.",
    "Unevaluated blocker-reason links and cross-platform associations are not public.",
    "No public score, score band, percentile, peer median, or difficulty verdict is available.",
  ],
  files: {
    llmIndex: `${canonicalUrl}/llms.txt`,
    fullContext: `${canonicalUrl}/llms-full.txt`,
    llmApiCatalog: `${canonicalUrl}/data/llm-api-catalog.json`,
    coverageSummary: `${canonicalUrl}/data/coverage-summary.json`,
    recordSchema: `${canonicalUrl}/data/record.schema.json`,
    measurementContract: `${canonicalUrl}/measurement-contract.md`,
    privacy: `${canonicalUrl}/privacy.md`,
  },
  records,
  sourceCode: {
    index: `${canonicalUrl}/source/index.md`,
    license: "Apache-2.0",
    files: sourceFiles.map((file) => ({
      path: file.path,
      url: sourceUrl(file.path),
      description: file.description,
    })),
  },
};
await writeFile(path.join(dataRoot, "index.json"), `${JSON.stringify(dataIndex, null, 2)}\n`, "utf8");

const selectionPolicy = await readFile(path.join(projectRoot, "SELECTION-POLICY.txt"), "utf8");
const measurementContract = await readFile(path.join(projectRoot, "MEASUREMENT-CONTRACT.txt"), "utf8");
const privacy = await readFile(path.join(projectRoot, "PRIVACY.md"), "utf8");
const eventContract = await readFile(path.join(projectRoot, "EVENT-CONTRACT.txt"), "utf8");
const launchChecklist = await readFile(path.join(projectRoot, "LAUNCH-CHECKLIST.txt"), "utf8");
const methodology = `# Developer Journey Atlas methodology

The Atlas publishes only a selected account-creation-to-first-success route that passes deterministic platform identity, first-party source-content, claim-grounding, required-field, branch, and route-integrity gates. Documentation structure is not evidence of usability, conversion, abandonment, difficulty, or causality.

${selectionPolicy.trim()}

${measurementContract.trim()}
`;
await writeFile(path.join(outputRoot, "methodology.md"), methodology, "utf8");
await writeFile(path.join(outputRoot, "measurement-contract.md"), `${measurementContract.trim()}\n`, "utf8");
await writeFile(path.join(outputRoot, "privacy.md"), `${privacy.trim()}\n`, "utf8");
await writeFile(path.join(outputRoot, "event-contract.txt"), `${eventContract.trim()}\n`, "utf8");
await writeFile(path.join(outputRoot, "launch-checklist.txt"), `${launchChecklist.trim()}\n`, "utf8");

const sourceSections = [];
for (const file of sourceFiles) {
  const content = await readFile(path.join(projectRoot, file.path), "utf8");
  const destination = path.join(sourceRoot, file.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  sourceSections.push(`## ${file.path}\n\n${file.description}\n\n${fencedCode(file.language, content)}`);
}
const sourceIndex = `# Developer Journey Atlas deployed source\n\nThe active product UI is \`packages/journey-corpus/web\`. Generated public files are machine artifacts only.\n\n${sourceFiles.map((file) => `- [${file.path}](${sourceUrl(file.path)}): ${file.description}`).join("\n")}\n`;
await writeFile(path.join(sourceRoot, "index.md"), sourceIndex, "utf8");

const recordLinks = records
  .map((record) => `- [${record.name}](${record.platformUrl}): ${record.outcome}`)
  .join("\n");
const llmCatalogSections = llmCohorts
  .map((cohort) => `### ${cohort.label}\n\n${cohort.providers.map((provider) => (
    provider.routeStatus === "published" && provider.routeUrl
      ? `- [${provider.name}](${provider.routeUrl}): reviewed route published`
      : `- ${provider.name}: route review in progress`
  )).join("\n")}`)
  .join("\n\n");
const llmsIndex = `# Developer Journey Atlas

> Publication-eligible, first-party documented routes from account creation to first success.

The reviewed repository contains ${summary.reviewedCorpusRecords} records. ${summary.publicRoutes} currently passes every publication gate. Other records and database research drafts are not public routes. Documentation structure is not observed difficulty, conversion, abandonment, or causality. Scores, percentiles, peer placement, model-selected blocker reasons, and cross-platform associations are unavailable.

## LLM API research catalog

The catalog tracks ${llmApiCatalog.providerCount} providers. Catalog membership means a research record exists. It does not mean a step-by-step route or comparison has passed independent review.

${llmCatalogSections}

## Public routes

${recordLinks || "- No route currently passes every publication gate."}

## Contracts

- [Machine-readable manifest](${canonicalUrl}/data/index.json)
- [LLM API research catalog](${canonicalUrl}/data/llm-api-catalog.json)
- [Methodology](${canonicalUrl}/methodology.md)
- [Measurement contract](${canonicalUrl}/measurement-contract.md)
- [Privacy and research data flow](${canonicalUrl}/privacy.md)
- [Measurement availability](${canonicalUrl}/event-contract.txt): \`measurement_unavailable\`, with no collector installed.
- [20-platform human review gate](${canonicalUrl}/launch-checklist.txt)
- [Deployed source](${canonicalUrl}/source/index.md)
`;
await writeFile(path.join(outputRoot, "llms.txt"), llmsIndex, "utf8");

const publicRecordSections = [];
for (const record of records) {
  const content = `${JSON.stringify(publicRecords.get(record.slug), null, 2)}\n`;
  publicRecordSections.push(`# ${record.name} public documented record\n\n${fencedCode("json", content)}`);
}
const llmsFull = `# Developer Journey Atlas full public context

Only publication-eligible routes are included. No score, comparison, blocker diagnosis, association, or causal claim is available.

${methodology.trim()}

${publicRecordSections.join("\n\n")}

# Deployed source

${sourceSections.join("\n\n")}
`;
await writeFile(path.join(outputRoot, "llms-full.txt"), llmsFull, "utf8");

const sitemapUrls = [
  `${canonicalUrl}/`,
  ...records.map((record) => record.platformUrl),
  `${canonicalUrl}/llms.txt`,
  `${canonicalUrl}/llms-full.txt`,
  `${canonicalUrl}/methodology.md`,
  `${canonicalUrl}/measurement-contract.md`,
  `${canonicalUrl}/privacy.md`,
  `${canonicalUrl}/event-contract.txt`,
  `${canonicalUrl}/launch-checklist.txt`,
  `${canonicalUrl}/data/index.json`,
  `${canonicalUrl}/source/index.md`,
  ...records.map((record) => record.recordUrl),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>
`;
await writeFile(path.join(outputRoot, "sitemap.xml"), sitemap, "utf8");
console.log(
  `Built public artifacts for ${summary.publicRoutes} eligible route from ${summary.reviewedCorpusRecords} reviewed records.`,
);
