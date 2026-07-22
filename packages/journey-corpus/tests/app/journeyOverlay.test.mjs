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
      primary_path: [
        { step_number: 1, action: "Open docs", required: true },
        { step_number: 2, action: "Create account", required: true },
      ],
      friction_gates: [
        { at_step: 2, type: "account", description: "Human must create account" },
      ],
    },
    {
      familyLookup: (id) =>
        id === "U04"
          ? { id: "U04", label: "Account fail", kind: "universal_family", diagnosticEligibility: "not_diagnosis_eligible" }
          : null,
    },
  );
  assert.equal(journey.steps.length, 2);
  assert.equal(journey.highlightedStepCount, 1);
  assert.equal(journey.steps[1].hasFriction, true);
  assert.equal(journey.steps[1].frictionGates[0].blockerHypotheses[0].id, "U04");
  assert.match(journey.note, /hypotheses/);
});
