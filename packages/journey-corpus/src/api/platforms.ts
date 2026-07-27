import type { Request, Response } from "express";
import type { DataStore, MetricRow, RouteStatus } from "../core/ports.js";
import { sendData, sendError } from "./http.js";
import { ensurePublicRow, ensureRow } from "./storeHelpers.js";

/**
 * Compact summary used by list and search results. Intentionally free of any
 * score, count, or comparability field: the public surface never ranks or
 * orders platforms against each other.
 */
export function routeStatus(row: MetricRow, store?: DataStore): RouteStatus {
  if (!store) return "unknown";
  if (store.isPublicEligible(row.slug)) return "published";
  return "known_needs_review";
}

export function toSummary(row: MetricRow, store?: DataStore) {
  return {
    name: row.name,
    slug: row.slug,
    category: row.category,
    outcome: row.outcome,
    routeStatus: routeStatus(row, store),
    reviewReasons: [],
  };
}

export function listPlatforms(store: DataStore) {
  return (req: Request, res: Response): void => {
    const includeAll = String(req.query.include ?? "").toLowerCase() === "all";
    const rows = includeAll
      ? store.listRows()
      : store.listRows().filter((row) => store.isPublicEligible(row.slug));
    const categories = [...new Set(rows.map((r) => r.category))].sort();
    sendData(res, rows.map((row) => toSummary(row, store)), { count: rows.length, categories });
  };
}

export function getPlatform(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const includeAll = String(req.query.include ?? "").toLowerCase() === "all";
    const row = includeAll ? await ensureRow(store, slug) : await ensurePublicRow(store, slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    if (includeAll && !store.isPublicEligible(slug)) {
      sendData(res, {
        ...toSummary(row, store),
        routeStatus: routeStatus(row, store),
        reviewReasons: [],
        documentedRouteUrl: null,
      });
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
