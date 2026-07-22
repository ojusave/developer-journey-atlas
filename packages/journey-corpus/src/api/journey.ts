import type { Request, Response } from "express";
import type { DataStore } from "../core/ports.js";
import { sendData, sendError } from "./http.js";

/** GET /api/platforms/:slug/journey — full docs path with friction highlights. */
export function getPlatformJourney(store: DataStore) {
  return (req: Request, res: Response): void => {
    const slug = String(req.params.slug);
    if (!store.getRow(slug)) {
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
    sendData(res, journey, {
      blockerReasonCount: store.blockerReasonCount?.() ?? null,
      honesty:
        "Friction gates are documented requirements. Linked blockers are hypotheses, not confirmed drop-off causes.",
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
