import test from "node:test";
import assert from "node:assert/strict";
import { buildJourneyOverlay } from "../../dist/core/journeyOverlay.js";
import { familyIdForGateType } from "../../dist/db/gateTypeFamilyMap.js";

test("familyIdForGateType maps account to U04", () => {
  assert.equal(familyIdForGateType("account"), "U04");
  assert.equal(familyIdForGateType("dns"), "U13");
});

test("buildJourneyOverlay highlights steps with gates and soft-maps families", () => {
  const journey = buildJourneyOverlay(
    {
      platform: { name: "Resend", slug: "resend", organization: "Resend" },
      category: "Communications, media, and social",
      entry_point: {
        starting_url: "https://resend.com/docs/send-with-nodejs",
      },
      primary_path: [
        { step_number: 1, action: "Open docs", required: true },
        { step_number: 2, action: "Create account", required: true },
      ],
      friction_gates: [
        { at_step: 2, type: "account", description: "Human must create account" },
      ],
    },
    {
      includeUnvalidatedHypotheses: true,
      familyLookup: (id) =>
        id === "U04"
          ? { id: "U04", label: "Account fail", kind: "universal_family", diagnosticEligibility: "not_diagnosis_eligible" }
          : null,
    },
  );
  assert.equal(journey.steps.length, 2);
  assert.equal(journey.steps[1].hasFriction, true);
  assert.equal(journey.steps[1].frictionGates[0].blockerHypotheses[0].id, "U04");
  assert.equal(journey.startingUrl, "https://resend.com/docs/send-with-nodejs");
  assert.match(journey.note, /hypotheses/);
});

test("public overlay suppresses unevaluated blocker links", () => {
  const journey = buildJourneyOverlay(
    {
      platform: { name: "Resend", slug: "resend", organization: "Resend" },
      category: "Communications",
      primary_path: [{ step_number: 1, action: "Create account", required: true }],
      friction_gates: [{ at_step: 1, type: "account", description: "Account required" }],
    },
    {
      familyLookup: () => ({
        id: "U04",
        label: "Account fail",
        kind: "universal_family",
        diagnosticEligibility: "not_diagnosis_eligible",
      }),
      modelLinks: [{
        gateKey: "1:account:0",
        reasonId: "U04.01",
        label: "Signup friction",
        diagnosticEligibility: "not_diagnosis_eligible",
        confidence: "model_selected",
        similarity: 0.9,
        rationale: "model choice",
      }],
    },
  );
  assert.deepEqual(journey.steps[0].frictionGates[0].blockerHypotheses, []);
});
