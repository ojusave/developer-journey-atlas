import type { Request, Response } from "express";
import type { DataStore, MetricRow } from "../core/ports.js";
import { sendData, sendError } from "./http.js";
import { ensurePublicRow } from "./storeHelpers.js";

/**
 * Compact summary used by list and search results. Intentionally free of any
 * score, count, or comparability field: the public surface never ranks or
 * orders platforms against each other.
 */
export function toSummary(row: MetricRow, store?: DataStore) {
  return {
    name: row.name,
    slug: row.slug,
    category: row.category,
    outcome: row.outcome,
  };
}

export function listPlatforms(store: DataStore) {
  return (_req: Request, res: Response): void => {
    const rows = store.listRows().filter((row) => store.isPublicEligible(row.slug));
    const categories = [...new Set(rows.map((r) => r.category))].sort();
    sendData(res, rows.map((row) => toSummary(row, store)), { count: rows.length, categories });
  };
}

export function getPlatform(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await ensurePublicRow(store, slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    const journey = store.getJourney?.(slug);
    if (!journey) {
      sendError(res, 404, "not_found", `No publication-eligible route found for "${slug}".`);
      return;
    }
    sendData(res, {
      name: journey.name,
      slug: journey.slug,
      organization: journey.organization,
      category: journey.category,
      outcome: row.outcome,
      startingUrl: journey.startingUrl,
      note: journey.note,
      documentedRouteUrl: `/api/platforms/${encodeURIComponent(slug)}/journey`,
    });
  };
}
