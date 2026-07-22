import type { Request, Response } from "express";
import type { DataStore } from "../core/ports.js";
import { buildCurvePlacement } from "../core/curvePlacement.js";
import { sendData, sendError } from "./http.js";
import { ensureRow } from "./storeHelpers.js";

/** GET /api/platforms/:slug/journey — full docs path with friction highlights. */
export function getPlatformJourney(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await ensureRow(store, slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    if (!store.getJourney) {
      sendError(res, 501, "not_supported", "Journey overlay is not available on this data store.");
      return;
    }
    const journey = store.getJourney(slug);
    if (!journey) {
      sendError(res, 404, "not_found", `No journey record found for "${slug}".`);
      return;
    }
    const curve = buildCurvePlacement(row, store);
    sendData(res, { ...journey, curve }, {
      blockerReasonCount: store.blockerReasonCount?.() ?? null,
      honesty:
        "Friction gates are documented requirements. Linked blockers are hypotheses, not confirmed drop-off causes. Curves use documentation counts only.",
    });
  };
}

/** GET /api/blockers/meta — taxonomy size and honesty note. */
export function getBlockerMeta(store: DataStore) {
  return (_req: Request, res: Response): void => {
    sendData(res, {
      reasonCount: store.blockerReasonCount?.() ?? 0,
      note: "790 blocker reasons are hypotheses across universal families and platform archetypes. They are not observed drop-off counts.",
    });
  };
}
