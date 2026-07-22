import type { Request, Response } from "express";
import type { DataStore, MetricRow } from "../core/ports.js";
import { buildAssessment } from "../core/assessment.js";
import { buildDocumentedOnboardingLoad } from "../core/onboardingLoad.js";
import { sendData, sendError } from "./http.js";

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
    auditStatus: store?.getAudit(row.slug)?.audit_status ?? "pending",
  };
}

export function listPlatforms(store: DataStore) {
  return (_req: Request, res: Response): void => {
    const rows = store.listRows();
    const categories = [...new Set(rows.map((r) => r.category))].sort();
    sendData(res, rows.map((row) => toSummary(row, store)), { count: rows.length, categories });
  };
}

export function getPlatform(store: DataStore) {
  return (req: Request, res: Response): void => {
    const slug = String(req.params.slug);
    const row = store.getRow(slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    const assessment = buildAssessment(row, store.getRecord(slug), buildDocumentedOnboardingLoad(row, store), store.getAudit(slug));
    sendData(res, assessment, { recordAvailable: assessment.recordAvailable });
  };
}
