import type { Request, Response } from "express";
import type { DataStore } from "../core/ports.js";
import { sendData, sendError } from "./http.js";
import { ensurePublicRow, ensureRow } from "./storeHelpers.js";

const PUBLISHED_EVIDENCE =
  "Published routes pass deterministic identity, source-content, claim-grounding, and selected-route integrity gates.";
const DRAFT_EVIDENCE =
  "This route is an unreviewed research draft built from official sources. It has not passed maintainer review and is excluded from the public corpus.";

/**
 * Review metadata for a route response. Drafts are labelled so a caller can
 * never mistake an unreviewed reconstruction for a published route. The
 * deterministic gate codes stay internal: only the coarse status is public.
 */
function reviewMeta(store: DataStore, slug: string): Record<string, unknown> {
  return store.isPublicEligible(slug)
    ? { reviewStatus: "published", evidence: PUBLISHED_EVIDENCE }
    : { reviewStatus: "unreviewed_draft", evidence: DRAFT_EVIDENCE };
}

/**
 * Resolve a row for a route response. The default stays fail-closed. Passing
 * include=all opts into an unreviewed research draft, but only when the record
 * carries a reconstructed graph: a corpus record awaiting review has no route
 * to show and still resolves to nothing.
 */
async function resolveRouteRow(store: DataStore, req: Request, slug: string) {
  const includeAll = String(req.query.include ?? "").toLowerCase() === "all";
  if (!includeAll) return ensurePublicRow(store, slug);
  const row = await ensureRow(store, slug);
  if (!row || !store.getJourneyGraph?.(slug)) return undefined;
  return row;
}

/** GET /api/platforms/:slug/journey: selected source-grounded route. */
export function getPlatformJourney(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await resolveRouteRow(store, req, slug);
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
    sendData(res, journey, reviewMeta(store, slug));
  };
}

/** GET /api/platforms/:slug/evidence: progressive official-source disclosure. */
export function getPlatformEvidence(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await resolveRouteRow(store, req, slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    const evidence = store.getJourneyEvidence?.(slug);
    if (!evidence || evidence.sources.length === 0) {
      sendError(res, 404, "not_found", `No public evidence disclosure found for "${slug}".`);
      return;
    }
    sendData(res, evidence, reviewMeta(store, slug));
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
