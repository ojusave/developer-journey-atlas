import path from "node:path";
import { readFileSync } from "node:fs";
import { config } from "../config.js";
import { LocalDataStore } from "../adapters/localData.js";
import { YouSearchProvider } from "../adapters/youSearch.js";
import { OpenRouterProvider } from "../adapters/openRouter.js";
import { GitHubPrWriter } from "../adapters/githubPr.js";
import { createRecordValidator } from "../core/validate.js";
import type { LLMProvider, MetricRow, PlatformRecord, RepoWriter, SearchProvider } from "../core/ports.js";
import { selectedPathRow } from "../../lib/measure.mjs";

// Each Workflow task runs in its own instance and builds only the dependencies
// it needs, lazily and once per process. Secrets are read from the environment,
// never passed in task arguments.

let storeSingleton: LocalDataStore | undefined;
export function getStore(): LocalDataStore {
  if (!storeSingleton) storeSingleton = new LocalDataStore(config.dataRoot);
  return storeSingleton;
}

export function buildRow(record: PlatformRecord): MetricRow {
  return selectedPathRow(record);
}

export function getSearchProvider(): SearchProvider {
  if (!config.youApiKey) throw new Error("YDC_API_KEY is not configured on the Workflow service.");
  return new YouSearchProvider(config.youApiKey);
}

export function getLLMProvider(): LLMProvider {
  if (!config.openRouterApiKey) throw new Error("OPENROUTER_API_KEY is not configured on the Workflow service.");
  const schemaPath = path.join(config.dataRoot, "record.schema.json");
  const schemaText = readFileSync(schemaPath, "utf8");
  const validate = createRecordValidator(schemaPath);
  const categories = [...new Set(getStore().listRows().map((r) => r.category))].sort();
  return new OpenRouterProvider(config.openRouterApiKey, config.openRouterModel, validate, schemaText, categories);
}

/** Repo writer, or undefined when no GITHUB_TOKEN is configured. */
export function getRepoWriter(): RepoWriter | undefined {
  return config.githubToken ? new GitHubPrWriter(config.githubToken, config.githubRepoSlug) : undefined;
}
