import { Router } from "express";
import type { DataStore } from "../core/ports.js";
import type { WorkflowRunner } from "../workflows/contract.js";
import { sendData } from "./http.js";
import { getPlatform, listPlatforms } from "./platforms.js";
import { searchPlatforms } from "./search.js";
import { getResearchStatus, startResearch } from "./research.js";

// Note: the cross-platform comparison endpoint (src/api/compare.ts +
// src/core/comparison.ts) is intentionally NOT mounted. It computes a
// score-based distribution that reads as a ranking, which the public surface
// no longer shows. Those files are kept in the repo, marked experimental and
// internal, in case a properly verified benchmark returns later.

/** Single router index. One place to see every route the API exposes. */
export function createApiRouter(store: DataStore, runner: WorkflowRunner | null): Router {
  const router = Router();

  router.get("/meta", (_req, res) => sendData(res, store.meta()));
  router.get("/platforms", listPlatforms(store));
  router.get("/platforms/:slug", getPlatform(store));
  router.get("/search", searchPlatforms(store));
  // Async research: start a durable Workflow run, then poll its status by id.
  router.post("/research", startResearch(store, runner));
  router.get("/research/:runId", getResearchStatus(runner));

  return router;
}
