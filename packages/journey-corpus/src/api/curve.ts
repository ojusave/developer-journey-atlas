import type { Request, Response } from "express";
import type { DataStore } from "../core/ports.js";
import { buildCurvePlacement } from "../core/curvePlacement.js";
import { buildOnboardingScore } from "../core/onboardingScore.js";
import { sendData, sendError } from "./http.js";
import { ensureRow } from "./storeHelpers.js";

/** GET /api/platforms/:slug/curve — corpus + category placement layers. */
export function getPlatformCurve(store: DataStore) {
  return async (req: Request, res: Response): Promise<void> => {
    const slug = String(req.params.slug);
    const row = await ensureRow(store, slug);
    if (!row) {
      sendError(res, 404, "not_found", `No platform found for "${slug}".`);
      return;
    }
    const curve = buildCurvePlacement(row, store);
    const onboardingScore = buildOnboardingScore(row, store.listRows());
    sendData(res, { ...curve, onboardingScore }, {
      honesty:
        "Documentation-derived counts only. Not drop-off. OpenRouter blocker links do not affect the curve or onboarding load score.",
    });
  };
}
