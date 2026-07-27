import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRecordValidator } from "../../dist/core/validate.js";
import { normalizeStepPhases } from "../../dist/adapters/openRouter.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("an enum violation names the values a repair pass may choose from", () => {
  const validate = createRecordValidator(path.join(projectRoot, "record.schema.json"));
  const { valid, errors } = validate({ primary_path: [{ step_number: 1, phase: "onboarding" }] });

  assert.equal(valid, false);
  const phaseError = errors.find((e) => e.startsWith("/primary_path/0/phase"));
  // Stripe research failed on exactly this, and the retry could not act on
  // "must be equal to one of the allowed values" without the list.
  assert.ok(phaseError, `expected a phase error, got: ${errors.join(" | ")}`);
  assert.match(phaseError, /allowed: .*\bconfigure\b/);
});

test("a near-miss phase is coerced on the graph nodes the route is rebuilt from", () => {
  const normalized = normalizeStepPhases({
    primary_path: [{ step_number: 1, phase: "Sign_Up" }],
    journey_graph: {
      nodes: [{ id: "n1", phase: "setup" }, { id: "n2", phase: "verify" }],
    },
  });

  assert.equal(normalized.primary_path[0].phase, "account");
  assert.equal(normalized.journey_graph.nodes[0].phase, "configure");
  assert.equal(normalized.journey_graph.nodes[1].phase, "verify");
});

test("an unrecognized phase is left for the validator to reject", () => {
  const normalized = normalizeStepPhases({
    journey_graph: { nodes: [{ id: "n1", phase: "vibe check" }] },
  });

  // Guessing here would mislabel a step with something the documentation
  // never said, so the value must survive to fail validation.
  assert.equal(normalized.journey_graph.nodes[0].phase, "vibe check");
});
