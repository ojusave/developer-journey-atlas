import express from "express";
import path from "node:path";
import { config, researchConfigStatus } from "./config.js";
import { LocalDataStore } from "./adapters/localData.js";
import { createApiRouter } from "./api/router.js";
import { sendError } from "./api/http.js";
import { createRecordValidator } from "./core/validate.js";
import { YouSearchProvider } from "./adapters/youSearch.js";
import { OpenRouterProvider } from "./adapters/openRouter.js";
import { GitHubPrWriter } from "./adapters/githubPr.js";
import type { ResearchDeps } from "./core/researchPipeline.js";
import type { PlatformRecord, MetricRow } from "./core/ports.js";
import { selectedPathRow } from "../lib/measure.mjs";
import { readFileSync } from "node:fs";

// Build Phase 2 research dependencies from config. Returns null when research is
// off or the required search/LLM keys are absent, so the API degrades cleanly.
function buildResearchDeps(store: LocalDataStore): ResearchDeps | null {
  if (!config.researchEnabled) return null;
  if (!config.youApiKey || !config.openRouterApiKey) {
    console.warn("RESEARCH_ENABLED is on but YDC_API_KEY or OPENROUTER_API_KEY is missing; research disabled.");
    return null;
  }
  const schemaPath = path.join(config.dataRoot, "record.schema.json");
  const schemaText = readFileSync(schemaPath, "utf8");
  const validate = createRecordValidator(schemaPath);

  const categories = [...new Set(store.listRows().map((r) => r.category))].sort();
  const search = new YouSearchProvider(config.youApiKey);
  const llm = new OpenRouterProvider(config.openRouterApiKey, config.openRouterModel, validate, schemaText, categories);
  const repo = config.githubToken
    ? new GitHubPrWriter(config.githubToken, config.githubRepoSlug)
    : undefined;

  return {
    search,
    llm,
    repo,
    store,
    buildRow: (record: PlatformRecord): MetricRow => selectedPathRow(record),
  };
}

// Composition root: build the concrete adapter, wire it into the API, and mount
// static assets. This is the only place implementations are chosen.
function main(): void {
  let store: LocalDataStore;
  try {
    store = new LocalDataStore(config.dataRoot);
  } catch (err) {
    console.error("Failed to load dataset artifacts. Did `npm run build:data` run?", err);
    process.exit(1);
    return;
  }

  const researchDeps = buildResearchDeps(store);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", platforms: store.meta().count });
  });

  app.use("/api", createApiRouter(store, researchDeps));

  // Unknown API routes return the JSON envelope, not the SPA shell.
  app.use("/api", (_req, res) => sendError(res, 404, "not_found", "Unknown API route."));

  // App shell (interactive UI) first, then the generated data artifacts
  // (/data, /llms.txt, /catalog.md, /source, etc.) without overriding "/".
  const webDir = path.join(config.dataRoot, "web");
  app.use(express.static(webDir));
  app.use(express.static(config.publicDir, { index: false }));

  // Generic error handler: never leak internals.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    sendError(res, 500, "internal_error", "Something went wrong.");
  });

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Developer Journey Atlas listening on 0.0.0.0:${config.port} (${store.meta().count} platforms)`);
  });
}

main();
