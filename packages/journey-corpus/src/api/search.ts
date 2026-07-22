import type { Request, Response } from "express";
import type { DataStore, MetricRow } from "../core/ports.js";
import { toSummary } from "./platforms.js";
import { sendData } from "./http.js";
import { isPostgresStore } from "./storeHelpers.js";

function relevance(row: MetricRow, q: string): number {
  const name = row.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  return 3;
}

function filterInMemory(rows: MetricRow[], q: string): MetricRow[] {
  return rows
    .filter((r) =>
      [r.name, r.category, r.outcome, r.selected_surface, r.first_success_type]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
    .sort((a, b) => relevance(a, q) - relevance(b, q) || a.name.localeCompare(b.name));
}

/** Free-text search across name, category, outcome, surface, and success type. */
export function searchPlatforms(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) {
      sendData(res, [], { query: q, count: 0 });
      return;
    }

    let matched: MetricRow[];
    if (isPostgresStore(store)) {
      // DB search so platforms persisted by other instances show up without restart.
      const dbRows = await store.searchRows(q, 80);
      const memoryExtra = filterInMemory(store.listRows(), q).filter(
        (row) => !dbRows.some((db) => db.slug === row.slug),
      );
      matched = [...dbRows, ...memoryExtra].sort(
        (a, b) => relevance(a, q) - relevance(b, q) || a.name.localeCompare(b.name),
      );
    } else {
      matched = filterInMemory(store.listRows(), q);
    }

    sendData(res, matched.map((row) => toSummary(row, store)), { query: q, count: matched.length });
  };
}
