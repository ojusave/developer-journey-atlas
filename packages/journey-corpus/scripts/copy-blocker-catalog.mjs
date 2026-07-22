#!/usr/bin/env node
/**
 * Copy the generated blocker catalog into the journey-corpus package so Render
 * deploys (rootDir=packages/journey-corpus) can seed without the monorepo root.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pkgRoot, "../..");
const sources = [
  path.join(repoRoot, "src/generated/catalog.json"),
  path.join(pkgRoot, "../../src/generated/catalog.json"),
];
const dest = path.join(pkgRoot, "blocker-catalog.json");

const source = sources.find((candidate) => existsSync(candidate));
if (!source) {
  console.error("catalog.json not found. From repo root run: npm run catalog:build");
  process.exit(1);
}
mkdirSync(path.dirname(dest), { recursive: true });
copyFileSync(source, dest);
console.log(`Copied ${source} -> ${dest}`);
