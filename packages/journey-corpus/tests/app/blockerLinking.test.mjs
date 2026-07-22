import test from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  filterConfirmedReasonIds,
  gateEmbedText,
  rankReasonsByEmbedding,
} from "../../dist/core/blockerLinking.js";
import { buildJourneyOverlay } from "../../dist/core/journeyOverlay.js";

test("cosineSimilarity is 1 for identical vectors", () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.ok(cosineSimilarity([1, 0], [0, 1]) < 0.01);
});

test("rankReasonsByEmbedding returns top-k by similarity", () => {
  const ranked = rankReasonsByEmbedding(
    [1, 0],
    [
      { id: "U01.01", label: "a", embedding: [1, 0] },
      { id: "U02.01", label: "b", embedding: [0, 1] },
      { id: "U03.01", label: "c", embedding: [0.9, 0.1] },
    ],
    2,
  );
  assert.equal(ranked[0].id, "U01.01");
  assert.equal(ranked.length, 2);
});

test("filterConfirmedReasonIds drops unknown ids", () => {
  const allowed = new Set(["U04.01", "U04.02"]);
  const picks = filterConfirmedReasonIds(
    { reason_ids: ["U04.01", "INVENTED", "U04.02", "U04.03"], rationale: "test" },
    allowed,
    3,
  );
  assert.deepEqual(picks.reasonIds, ["U04.01", "U04.02"]);
  assert.equal(picks.rationale, "test");
});

test("gateEmbedText includes type and description", () => {
  const text = gateEmbedText({ type: "account", description: "Sign up", stepAction: "Create account" });
  assert.match(text, /account/);
  assert.match(text, /Sign up/);
  assert.match(text, /Create account/);
});

test("buildJourneyOverlay merges openrouter reason links with soft-map", () => {
  const journey = buildJourneyOverlay(
    {
      platform: { name: "Resend", slug: "resend", organization: "Resend" },
      category: "Communications, media, and social",
      primary_path: [
        { step_number: 1, action: "Open docs", required: true },
        { step_number: 2, action: "Create account", required: true },
      ],
      friction_gates: [{ at_step: 2, type: "account", description: "Human must create account" }],
    },
    {
      familyLookup: (id) =>
        id === "U04"
          ? { id: "U04", label: "Account fail", kind: "universal_family", diagnosticEligibility: "not_diagnosis_eligible" }
          : null,
      modelLinks: [{
        gateKey: "2:account:0",
        reasonId: "U04.01",
        label: "Signup friction",
        diagnosticEligibility: "not_diagnosis_eligible",
        confidence: "confirmed",
        similarity: 0.81,
        rationale: "Account creation gate",
      }],
    },
  );
  const hyps = journey.steps[1].frictionGates[0].blockerHypotheses;
  assert.equal(hyps.length, 2);
  assert.equal(hyps[0].linkSource, "soft-map");
  assert.equal(hyps[1].linkSource, "openrouter");
  assert.equal(hyps[1].id, "U04.01");
  assert.match(hyps[1].note, /hypothesis/i);
});
