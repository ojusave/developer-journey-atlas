import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "public");
const dataRoot = path.join(outputRoot, "data");
const sourceRoot = path.join(outputRoot, "source");
const canonicalUrl = process.env.PUBLIC_BASE_URL ?? "https://developer-journey-atlas.onrender.com";

const sourceFiles = [
  { path: "site/index.html", language: "html", description: "Accessible static-site document." },
  { path: "site/app.js", language: "javascript", description: "Browser-side dataset loading, search, filters, and rendering." },
  { path: "site/styles.css", language: "css", description: "Visual design and responsive layout." },
  { path: "site/robots.txt", language: "text", description: "Crawler access and sitemap discovery." },
  { path: "scripts/build-site.mjs", language: "javascript", description: "Deterministic static-site and LLM artifact generator." },
  { path: "scripts/check-llm-site.mjs", language: "javascript", description: "Machine-readable artifact contract checks." },
  { path: "scripts/validate-shortest-path-audits.mjs", language: "javascript", description: "Validates shortest-path audits, source hashes, evidence references, and corpus audit status." },
  { path: "build-all.mjs", language: "javascript", description: "Reproducible validation and derived-artifact pipeline." },
  { path: "build-selected-path.mjs", language: "javascript", description: "Experimental, internal selected-route heuristic-score generator. Its output is not published to the public site and is not shown to visitors." },
  { path: "build-ds-quality.mjs", language: "javascript", description: "Analytical quality and comparability metadata generator." },
  { path: "validate-records.mjs", language: "javascript", description: "Canonical record schema and evidence validation." },
  { path: "build-catalog.mjs", language: "javascript", description: "Human-readable catalog generation." },
  { path: "lib/measure.mjs", language: "javascript", description: "Shared normalized measurement and classification functions." },
  { path: "tests/regression.mjs", language: "javascript", description: "Regression fixtures for the measurement layer." },
  { path: "package.json", language: "json", description: "Supported build, validation, audit, and test commands." },
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
await mkdir(dataRoot, { recursive: true });
await mkdir(sourceRoot, { recursive: true });
await cp(path.join(projectRoot, "site"), outputRoot, { recursive: true, force: true });
// selected-path-heuristic.json is intentionally NOT published. It is the
// experimental, internal effort-score output and is kept out of the public
// site. The generator (build-selected-path.mjs) and its output stay in the
// repo, clearly relabeled, in case a properly verified benchmark returns.
await cp(path.join(projectRoot, "ds-quality.json"), path.join(dataRoot, "ds-quality.json"));
await cp(path.join(projectRoot, "coverage.json"), path.join(dataRoot, "coverage.json"));
await cp(path.join(projectRoot, "record.schema.json"), path.join(dataRoot, "record.schema.json"));
await cp(path.join(projectRoot, "shortest-path-audit.schema.json"), path.join(dataRoot, "shortest-path-audit.schema.json"));
await cp(path.join(projectRoot, "audit-status.json"), path.join(dataRoot, "audit-status.json"));
await cp(path.join(projectRoot, "records"), path.join(dataRoot, "records"), { recursive: true, force: true });
await cp(path.join(projectRoot, "audits"), path.join(dataRoot, "audits"), { recursive: true, force: true });

const coverage = JSON.parse(await readFile(path.join(projectRoot, "coverage.json"), "utf8"));
// selected-path-heuristic.json is read only to enumerate platforms (name, slug,
// category, outcome) for the manifest. Its scores are never emitted publicly.
const atlas = JSON.parse(await readFile(path.join(projectRoot, "selected-path-heuristic.json"), "utf8"));
const auditStatus = JSON.parse(await readFile(path.join(projectRoot, "audit-status.json"), "utf8"));
const summary = {
  generatedAt: coverage.generated_at,
  platforms: coverage.roster_count,
  steps: coverage.records.reduce((total, record) => total + record.steps, 0),
  sources: coverage.records.reduce((total, record) => total + record.sources, 0),
  recordsWithErrors: coverage.records.filter((record) => record.errors.length > 0).length,
  audits: {
    verified: auditStatus.verified,
    needsHumanJudgment: auditStatus.needs_human_judgment,
    blocked: auditStatus.blocked,
    pending: auditStatus.pending,
  },
};

await writeFile(
  path.join(dataRoot, "coverage-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

const auditBySlug = new Map(auditStatus.records.map((record) => [record.slug, record]));
const records = atlas.rows.map((row) => ({
  name: row.name,
  slug: row.slug,
  category: row.category,
  outcome: row.outcome,
  url: `${canonicalUrl}/data/records/${row.slug}.json`,
  auditStatus: auditBySlug.get(row.slug)?.status ?? "pending",
  auditUrl: auditBySlug.get(row.slug)?.audit_url ? `${canonicalUrl}${auditBySlug.get(row.slug).audit_url}` : null,
}));

const dataIndex = {
  schemaVersion: 1,
  name: "Developer Journey Atlas",
  description: "Preserved official-documentation evidence records plus verified shortest required paths from account creation to first success.",
  canonicalUrl,
  generatedAt: coverage.generated_at,
  interpretation: [
    "A canonical source record is evidence, not automatically a verified shortest required path.",
    "Only audits marked verified may expose action counts or anonymous peer context.",
    "Verified paths begin at account creation, list every evidenced required field, and stop at first success.",
    "This dataset is not product usability, conversion, drop-off, or observed developer completion time.",
  ],
  counts: summary,
  files: {
    llmIndex: `${canonicalUrl}/llms.txt`,
    fullContext: `${canonicalUrl}/llms-full.txt`,
    catalog: `${canonicalUrl}/catalog.md`,
    analyticalQuality: `${canonicalUrl}/data/ds-quality.json`,
    coverage: `${canonicalUrl}/data/coverage.json`,
    coverageSummary: `${canonicalUrl}/data/coverage-summary.json`,
    recordSchema: `${canonicalUrl}/data/record.schema.json`,
    shortestPathAuditSchema: `${canonicalUrl}/data/shortest-path-audit.schema.json`,
    auditStatus: `${canonicalUrl}/data/audit-status.json`,
    measurementContract: `${canonicalUrl}/measurement-contract.md`,
  },
  records,
  sourceCode: {
    index: `${canonicalUrl}/source/index.md`,
    license: "Apache-2.0",
    notice: "Software is Apache-2.0. Original research is CC-BY-4.0 under the repository license scope.",
    files: sourceFiles.map((file) => ({
      path: file.path,
      url: sourceUrl(file.path),
      description: file.description,
    })),
  },
};

await writeFile(
  path.join(dataRoot, "index.json"),
  `${JSON.stringify(dataIndex, null, 2)}\n`,
  "utf8",
);

const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
const selectionPolicy = await readFile(path.join(projectRoot, "SELECTION-POLICY.md"), "utf8");
const measurementContract = await readFile(path.join(projectRoot, "MEASUREMENT-CONTRACT.md"), "utf8");
const schema = await readFile(path.join(projectRoot, "record.schema.json"), "utf8");
const auditSchema = await readFile(path.join(projectRoot, "shortest-path-audit.schema.json"), "utf8");
const auditStatusText = await readFile(path.join(projectRoot, "audit-status.json"), "utf8");
const renderAudit = await readFile(path.join(projectRoot, "audits/render.json"), "utf8");
const zoomAudit = await readFile(path.join(projectRoot, "audits/zoom.json"), "utf8");
const catalog = (await readFile(path.join(projectRoot, "catalog.md"), "utf8"))
  .replaceAll("](records/", "](data/records/")
  .replaceAll("](audits/", "](data/audits/");

const methodology = `# Developer Journey Atlas methodology\n\n${readme.trim()}\n\n${selectionPolicy.trim()}\n\n${measurementContract.trim()}\n`;
await writeFile(path.join(outputRoot, "methodology.md"), methodology, "utf8");
await writeFile(path.join(outputRoot, "measurement-contract.md"), `${measurementContract.trim()}\n`, "utf8");
await writeFile(path.join(outputRoot, "catalog.md"), `${catalog.trim()}\n`, "utf8");

const sourceSections = [];
for (const file of sourceFiles) {
  const content = await readFile(path.join(projectRoot, file.path), "utf8");
  const destination = path.join(sourceRoot, file.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
  sourceSections.push(`## ${file.path}\n\n${file.description}\n\n${fencedCode(file.language, content)}`);
}

const sourceIndex = `# Developer Journey Atlas source code\n\n> Deployed source snapshot for the Developer Journey Atlas static site and its research-data generators.\n\nSoftware is Apache-2.0 and original research is CC BY 4.0 under the repository license scope. Generated research artifacts and the 205 evidence records are indexed separately in [the data manifest](${canonicalUrl}/data/index.json).\n\n## Site and build\n\n${sourceFiles.map((file) => `- [${file.path}](${sourceUrl(file.path)}): ${file.description}`).join("\n")}\n`;
await writeFile(path.join(sourceRoot, "index.md"), sourceIndex, "utf8");

const llmsIndex = `# Developer Journey Atlas\n\n> Account creation to first developer success, with preserved official evidence for 205 platforms.\n\nA source record is not automatically a verified shortest path. Use only audits marked verified for action counts or peer context. Verified audits list required fields, exclude optional work, and keep platform automation outside the developer action count. This is not conversion, drop-off, usability, or observed completion-time data. Software is Apache-2.0 and original research is CC BY 4.0 under the repository license scope.\n\n## Start here\n\n- [Audit status](${canonicalUrl}/data/audit-status.json): Corpus-wide verified, unresolved, blocked, and pending status.\n- [Shortest-path audit schema](${canonicalUrl}/data/shortest-path-audit.schema.json): Machine-readable audit contract.\n- [Render shortest-path audit](${canonicalUrl}/data/audits/render.json): Verified calibration case.\n- [Zoom shortest-path audit](${canonicalUrl}/data/audits/zoom.json): Unresolved calibration case with exact evidence gaps.\n- [Machine-readable manifest](${canonicalUrl}/data/index.json): Data boundaries and record links.\n- [Methodology](${canonicalUrl}/methodology.md): Research and measurement contracts.\n- [Full LLM context](${canonicalUrl}/llms-full.txt): Consolidated methodology, catalog, schemas, and deployed source.\n\n## Preserved evidence\n\n- [Coverage report](${canonicalUrl}/data/coverage.json): Structural status for canonical source records.\n- [Source record schema](${canonicalUrl}/data/record.schema.json): Evidence-archive contract.\n- [Render source record](${canonicalUrl}/data/records/render.json): Preserved pre-audit evidence record.\n\n## Source code\n\n- [Source index](${canonicalUrl}/source/index.md): Deployed source files and purpose notes.\n${sourceFiles.map((file) => `- [${file.path}](${sourceUrl(file.path)}): ${file.description}`).join("\n")}\n`;
await writeFile(path.join(outputRoot, "llms.txt"), llmsIndex, "utf8");

const llmsFull = `# Developer Journey Atlas: full LLM context\n\n> Consolidated methodology, audit status, verified calibration data, schemas, catalog, and deployed source code. For current canonical JSON, use ${canonicalUrl}/data/index.json.\n\nOnly audits marked verified may supply action counts, required-field counts, or peer context. Software is Apache-2.0 and original research is CC BY 4.0 under the repository license scope.\n\n${methodology.trim()}\n\n# Corpus audit status\n\n${fencedCode("json", auditStatusText)}\n\n# Verified Render shortest-path audit\n\n${fencedCode("json", renderAudit)}\n\n# Unresolved Zoom shortest-path audit\n\n${fencedCode("json", zoomAudit)}\n\n# Audit catalog\n\n${catalog.replace(/^# .*\n+/, "").trim()}\n\n# Shortest-path audit schema\n\n${fencedCode("json", auditSchema)}\n\n# Preserved source-record schema\n\n${fencedCode("json", schema)}\n\n# Deployed source code\n\n${sourceSections.join("\n\n")}\n`;
await writeFile(path.join(outputRoot, "llms-full.txt"), llmsFull, "utf8");

const sitemapUrls = [
  `${canonicalUrl}/`,
  `${canonicalUrl}/llms.txt`,
  `${canonicalUrl}/llms-full.txt`,
  `${canonicalUrl}/methodology.md`,
  `${canonicalUrl}/measurement-contract.md`,
  `${canonicalUrl}/catalog.md`,
  `${canonicalUrl}/data/index.json`,
  `${canonicalUrl}/data/audit-status.json`,
  `${canonicalUrl}/data/shortest-path-audit.schema.json`,
  `${canonicalUrl}/source/index.md`,
  ...records.filter((record) => record.auditUrl).map((record) => record.auditUrl),
  ...records.map((record) => record.url),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(outputRoot, "sitemap.xml"), sitemap, "utf8");

console.log(`Built Developer Journey Atlas with ${summary.platforms} platforms.`);
