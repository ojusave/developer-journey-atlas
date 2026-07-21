// EXPERIMENTAL / INTERNAL. Not mounted on the public API router.
//
// This handler returns the score-based comparison distribution, which reads as
// a ranking. It is kept in the repo for reproducibility but is intentionally
// not exposed by createApiRouter (see src/api/router.ts).
import type { Request, Response } from "express";
import type { DataStore } from "../core/ports.js";
import { buildComparison } from "../core/comparison.js";
import { sendData, sendError } from "./http.js";

export function getComparison(store: DataStore) {
  return (req: Request, res: Response): void => {
    const slug = String(req.query.slug ?? "").trim();
    if (!slug) {
      sendError(res, 400, "missing_slug", "Provide a platform slug: /api/compare?slug=render.");
      return;
    }
    const row = store.getRow(slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    sendData(res, buildComparison(row, store.listRows()));
  };
}
