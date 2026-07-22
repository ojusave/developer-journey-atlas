import express from "express";
import path from "node:path";
import { config, researchAvailability } from "./config.js";
import { LocalDataStore } from "./adapters/localData.js";
import { createApiRouter } from "./api/router.js";
import { sendError } from "./api/http.js";
import { RenderWorkflowRunner } from "./adapters/renderWorkflows.js";
import type { WorkflowRunner } from "./workflows/contract.js";

// Build the Workflow runner from config. Returns null when the Render API key or
// task slug is absent, so the research endpoints degrade cleanly. The web
// service never runs research itself: it starts and reads durable Workflow runs.
function buildWorkflowRunner(): WorkflowRunner | null {
  const { available, missing } = researchAvailability();
  if (!available) {
    console.warn(`Live research disabled: missing ${missing.join(", ")}.`);
    return null;
  }
  return new RenderWorkflowRunner(config.workflowTaskSlug, config.renderApiKey);
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

  const runner = buildWorkflowRunner();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", platforms: store.meta().count });
  });

  app.use("/api", createApiRouter(store, runner));

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
