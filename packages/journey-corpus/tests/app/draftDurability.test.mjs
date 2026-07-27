import test from "node:test";
import assert from "node:assert/strict";

import { persistResearchDraft } from "../../dist/db/persistResearchDraft.js";

function record() {
  return {
    platform: { name: "Acme", slug: "acme", organization: "Acme Inc" },
    category: "Payments",
    research_status: "complete",
    researched_at: "2026-07-27",
    primary_path: [],
    friction_gates: [],
    journey_graph: { platformSlug: "acme" },
  };
}

const row = { slug: "acme", name: "Acme", category: "Payments" };

// Supplied so the fixture does not need the full source set the audit builder wants.
const audit = { audit_status: "pass", audited_at: "2026-07-27", source_record_sha256: "x", counts: {} };

/** Prisma double that records the platform upsert payload. */
function fakePrisma({ exists }) {
  const calls = {};
  const noop = async () => ({});
  return {
    calls,
    platform: {
      findUnique: async () => (exists ? { slug: "acme" } : null),
      upsert: async (args) => {
        calls.platform = args;
        return {};
      },
      count: async () => 1,
    },
    metric: { upsert: noop },
    journeyStep: { deleteMany: noop, createMany: noop },
    frictionGate: { deleteMany: noop, createMany: noop },
    audit: { upsert: noop },
    datasetMeta: { findUnique: async () => null, upsert: noop },
  };
}

test("saving a draft for an existing platform leaves the canonical corpus record alone", async () => {
  const prisma = fakePrisma({ exists: true });
  const result = await persistResearchDraft(record(), row, { prisma, audit });

  assert.equal(result.created, false);
  const { update } = prisma.calls.platform;
  // The seed rewrites recordJson on every deploy. A draft written there would
  // be discarded on the next release, which is the bug this separation fixes.
  assert.equal("recordJson" in update, false);
  assert.deepEqual(update.draftRecordJson.journey_graph, { platformSlug: "acme" });
});

test("a platform first seen by research is created with both records", async () => {
  const prisma = fakePrisma({ exists: false });
  const result = await persistResearchDraft(record(), row, { prisma, audit });

  assert.equal(result.created, true);
  const { create } = prisma.calls.platform;
  assert.ok(create.recordJson, "an unmapped platform has no corpus record to fall back on");
  assert.ok(create.draftRecordJson);
});
