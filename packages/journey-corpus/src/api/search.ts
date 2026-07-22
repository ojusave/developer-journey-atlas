import type { Request, Response } from "express";
import type { DataStore, MetricRow } from "../core/ports.js";
import { toSummary } from "./platforms.js";
import { sendData } from "./http.js";

function relevance(row: MetricRow, q: string): number {
  const name = row.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  return 3;
}

/** Free-text search across name, category, outcome, surface, and success type. */
export function searchPlatforms(store: DataStore) {
  return (req: Request, res: Response): void => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const rows = store.listRows();
    if (!q) {
      sendData(res, [], { query: q, count: 0 });
      return;
    }
    const matched = rows
      .filter((r) =>
        [r.name, r.category, r.outcome, r.selected_surface, r.first_success_type]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => relevance(a, q) - relevance(b, q) || a.name.localeCompare(b.name));

    sendData(res, matched.map((row) => toSummary(row, store)), { query: q, count: matched.length });
  };
}
