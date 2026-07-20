import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "public");
const dataRoot = path.join(outputRoot, "data");

await mkdir(dataRoot, { recursive: true });
await cp(path.join(projectRoot, "site"), outputRoot, { recursive: true, force: true });
await cp(path.join(projectRoot, "selected-path-heuristic.json"), path.join(dataRoot, "selected-path-heuristic.json"));
await cp(path.join(projectRoot, "records"), path.join(dataRoot, "records"), { recursive: true, force: true });

const coverage = JSON.parse(await readFile(path.join(projectRoot, "coverage.json"), "utf8"));
const summary = {
  generatedAt: coverage.generated_at,
  platforms: coverage.roster_count,
  steps: coverage.records.reduce((total, record) => total + record.steps, 0),
  sources: coverage.records.reduce((total, record) => total + record.sources, 0),
  recordsWithErrors: coverage.records.filter((record) => record.errors.length > 0).length,
};

await writeFile(
  path.join(dataRoot, "coverage-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

console.log(`Built First-Mile Atlas with ${summary.platforms} platforms.`);
