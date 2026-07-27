import express from "express";
import path from "node:path";
import { readFile } from "node:fs/promises";
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageOrigin(req: express.Request): string {
  return config.publicBaseUrl || `${req.protocol}://${req.get("host")}`;
}

function renderPage(
  template: string,
  values: {
    title: string;
    description: string;
    canonicalUrl: string;
    socialImageUrl: string;
    coverage: string;
  },
): string {
  return template
    .replaceAll("__PAGE_TITLE__", escapeHtml(values.title))
    .replaceAll("__PAGE_DESCRIPTION__", escapeHtml(values.description))
    .replaceAll("__CANONICAL_URL__", escapeHtml(values.canonicalUrl))
    .replaceAll("__SOCIAL_IMAGE_URL__", escapeHtml(values.socialImageUrl))
    .replaceAll("__PUBLIC_COVERAGE__", escapeHtml(values.coverage));
}

// Composition root: choose Local vs Postgres DataStore, wire API, mount static assets.
async function main(): Promise<void> {
  let store: DataStore;
  let mode: string;
  try {
    ({ store, mode } = await createDataStore());
  } catch {
    console.error("Server diagnostic: stage=dataset-load outcome=store_error");
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
  const pageTemplate = await readFile(path.join(webDir, "index.html"), "utf8");
  const publicRecords = store.meta().publicRecords ??
    store.listRows().filter((row) => store.isPublicEligible(row.slug)).length;
  const reviewedRecords = store.meta().reviewedCorpusRecords ?? store.meta().totals.platforms;
  const coverage = `${publicRecords} of ${reviewedRecords} corpus records currently publish a reviewed route`;

  app.get("/", (req, res) => {
    const origin = pageOrigin(req);
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.type("html").send(renderPage(pageTemplate, {
      title: "Developer Journey Atlas",
      description:
        "Search 237 developer platforms and inspect reviewed first-mile routes from account creation to first success.",
      canonicalUrl: `${origin}/`,
      socialImageUrl: `${origin}/social-preview.svg`,
      coverage,
    }));
  });

  app.get("/platform/:slug", async (req, res) => {
    const slug = String(req.params.slug);
    const row = store.isPublicEligible(slug) ? store.getRow(slug) : undefined;
    const known = store.getRow(slug);
    const origin = pageOrigin(req);
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    if (!row && known) {
      res.type("html").send(renderPage(pageTemplate, {
        title: `${known.name} path builder | Developer Journey Atlas`,
        description:
          `${known.name} is in the Atlas corpus. Build its step-by-step path from official docs.`,
        canonicalUrl: `${origin}/platform/${encodeURIComponent(slug)}`,
        socialImageUrl: `${origin}/social-preview.svg`,
        coverage,
      }));
      return;
    }
    if (!row) {
      res.status(404).type("html").send(renderPage(pageTemplate, {
        title: "Route not found | Developer Journey Atlas",
        description: "This platform does not have a published source-grounded route.",
        canonicalUrl: `${origin}/platform/${encodeURIComponent(slug)}`,
        socialImageUrl: `${origin}/social-preview.svg`,
        coverage,
      }));
      return;
    }
    res.type("html").send(renderPage(pageTemplate, {
      title: `${row.name} documented route | Developer Journey Atlas`,
      description: `Inspect ${row.name}'s source-grounded route from account creation to first developer success.`,
      canonicalUrl: `${origin}/platform/${encodeURIComponent(row.slug)}`,
      socialImageUrl: `${origin}/social-preview.svg`,
      coverage,
    }));
  });

  app.use(express.static(webDir, {
    setHeaders(res, filePath) {
      if (/\.(?:js|css|html)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));
  app.use(express.static(config.publicDir, { index: false }));

  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Server diagnostic: stage=request outcome=internal_error");
    sendError(res, 500, "internal_error", "Something went wrong.");
  });

  app.listen(config.port, "0.0.0.0", () => {
    console.log(
      `Developer Journey Atlas listening on 0.0.0.0:${config.port} (${store.meta().count} platforms, store=${mode})`,
    );
  });
}

main().catch(() => {
  console.error("Server diagnostic: stage=startup outcome=internal_error");
  process.exit(1);
});
