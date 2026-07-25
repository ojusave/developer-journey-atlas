import type { Request, Response } from "express";
import type { DataStore } from "../core/ports.js";
import { sendData, sendError } from "./http.js";
import { ensurePublicRow } from "./storeHelpers.js";

/** GET /api/platforms/:slug/journey: selected source-grounded route. */
export function getPlatformJourney(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await ensurePublicRow(store, slug);
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
    sendData(res, journey, {
      evidence:
        "Published routes pass deterministic identity, source-content, claim-grounding, and selected-route integrity gates.",
    });
  };
}

/** GET /api/platforms/:slug/evidence: progressive official-source disclosure. */
export function getPlatformEvidence(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await ensurePublicRow(store, slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    const evidence = store.getJourneyEvidence?.(slug);
    if (!evidence || evidence.sources.length === 0) {
      sendError(res, 404, "not_found", `No public evidence disclosure found for "${slug}".`);
      return;
    }
    sendData(res, evidence);
  };
}

/** GET /api/blockers/meta: public evaluation status only. */
export function getBlockerMeta(store: DataStore) {
  return (_req: Request, res: Response): void => {
    sendData(res, {
      publicLinksAvailable: false,
      note: "Blocker-reason links remain internal until the labeled evaluation and owner-approved thresholds pass.",
    });
  };
}
