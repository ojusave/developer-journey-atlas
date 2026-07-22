import express from "express";
import path from "node:path";
import { config, researchAvailability } from "./config.js";
import { createDataStore } from "./adapters/createStore.js";
import { createApiRouter } from "./api/router.js";
import { sendError } from "./api/http.js";
import { RenderWorkflowRunner } from "./adapters/renderWorkflows.js";
import type { WorkflowRunner } from "./workflows/contract.js";
import type { DataStore } from "./core/ports.js";
import type { PostgresDataStore } from "./adapters/postgresData.js";

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

function isPostgresStore(store: DataStore): store is PostgresDataStore {
  return typeof (store as PostgresDataStore).ping === "function";
}

// Composition root: choose Local vs Postgres DataStore, wire API, mount static assets.
async function main(): Promise<void> {
  let store: DataStore;
  let mode: string;
  try {
    ({ store, mode } = await createDataStore());
  } catch (err) {
    console.error("Failed to load dataset. For postgres: migrate + seed. For local: run build:data.", err);
    process.exit(1);
    return;
  }

  const runner = buildWorkflowRunner();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", async (_req, res) => {
    const payload: Record<string, unknown> = {
      status: "ok",
      platforms: store.meta().count,
      dataStore: mode,
      blockerReasons: store.blockerReasonCount?.() ?? null,
    };
    if (isPostgresStore(store)) {
      try {
        await store.ping();
        payload.database = "up";
      } catch {
        payload.database = "down";
        res.status(503);
      }
    }
    res.json(payload);
  });

  app.use("/api", createApiRouter(store, runner));
  app.use("/api", (_req, res) => sendError(res, 404, "not_found", "Unknown API route."));

  const webDir = path.join(config.dataRoot, "web");
  app.use(express.static(webDir));
  app.use(express.static(config.publicDir, { index: false }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    sendError(res, 500, "internal_error", "Something went wrong.");
  });

  app.listen(config.port, "0.0.0.0", () => {
    console.log(
      `Developer Journey Atlas listening on 0.0.0.0:${config.port} (${store.meta().count} platforms, store=${mode})`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
