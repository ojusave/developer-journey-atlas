import { Router } from "express";
import type { DataStore } from "../core/ports.js";
import type { ResearchDeps } from "../core/researchPipeline.js";
import { sendData } from "./http.js";
import { getPlatform, listPlatforms } from "./platforms.js";
import { getComparison } from "./compare.js";
import { searchPlatforms } from "./search.js";
import { startResearch } from "./research.js";

/** Single router index. One place to see every route the API exposes. */
export function createApiRouter(store: DataStore, researchDeps: ResearchDeps | null): Router {
  const router = Router();

  router.get("/meta", (_req, res) => sendData(res, store.meta()));
  router.get("/platforms", listPlatforms(store));
  router.get("/platforms/:slug", getPlatform(store));
  router.get("/compare", getComparison(store));
  router.get("/search", searchPlatforms(store));
  router.post("/research", startResearch(researchDeps));

  return router;
}
