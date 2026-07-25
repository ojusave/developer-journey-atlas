import type { Request, Response } from "express";
import type { DataStore } from "../core/ports.js";
import { buildPeerComparison } from "../core/peerComparison.js";
import { sendData, sendError } from "./http.js";
import { ensurePublicRow } from "./storeHelpers.js";

/** GET /api/platforms/:slug/curve: fail-closed direct route comparison. */
export function getPlatformCurve(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await ensurePublicRow(store, slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    sendData(res, buildPeerComparison(store, row.slug));
  };
}
