import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COMPLETED_CLAIM_RETENTION_MS,
  STALE_ACTIVE_CLAIM_RETENTION_MS,
  cleanupResearchClaims,
  completeResearchClaim,
  completeResearchClaimByRunId,
  countRecentResearchStarts,
} from "../../dist/db/researchClaims.js";

test("claim completion stores only terminal status for the selected slug", async () => {
  const calls = [];
  const prisma = {
    researchClaim: {
      updateMany: async (args) => {
        calls.push(args);
        return { count: 1 };
      },
    },
  };
  await completeResearchClaim("acme", prisma);
  assert.deepEqual(calls, [{
    where: { slug: "acme" },
    data: { status: "completed" },
  }]);
});

test("claim completion can use the run id when an alias resolves to a canonical slug", async () => {
  let received;
  const prisma = {
    researchClaim: {
      updateMany: async (args) => {
        received = args;
        return { count: 1 };
      },
    },
  };
  await completeResearchClaimByRunId("run-gemini", prisma);
  assert.deepEqual(received, {
    where: { runId: "run-gemini" },
    data: { status: "completed" },
  });
});

test("claim cleanup enforces seven-day terminal and one-day active retention", async () => {
  const now = Date.UTC(2026, 6, 25, 12, 0, 0);
  let received;
  const prisma = {
    researchClaim: {
      deleteMany: async (args) => {
        received = args;
        return { count: 3 };
      },
    },
  };
  assert.deepEqual(await cleanupResearchClaims(prisma, now), { deleted: 3 });
  assert.deepEqual(received.where.OR, [
    {
      status: { in: ["completed", "failed"] },
      updatedAt: { lt: new Date(now - COMPLETED_CLAIM_RETENTION_MS) },
    },
    {
      status: { in: ["claiming", "pending"] },
      updatedAt: { lt: new Date(now - STALE_ACTIVE_CLAIM_RETENTION_MS) },
    },
  ]);
});

test("global research capacity counts starts across the shared time window", async () => {
  const now = Date.UTC(2026, 6, 25, 12, 0, 0);
  let received;
  const prisma = {
    researchClaim: {
      count: async (args) => {
        received = args;
        return 17;
      },
    },
  };
  assert.equal(await countRecentResearchStarts(prisma, 60 * 60 * 1_000, { now }), 17);
  assert.deepEqual(received, {
    where: { startedAt: { gte: new Date(now - 60 * 60 * 1_000) } },
  });
});

test("privacy migration removes client IP storage and installs bounded cleanup", async () => {
  const migration = await readFile(
    new URL("../../prisma/migrations/20260725062000_research_claim_privacy/migration.sql", import.meta.url),
    "utf8",
  );
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.doesNotMatch(schema, /\bclientIp\b/);
  assert.match(migration, /DROP COLUMN IF EXISTS "clientIp"/);
  assert.match(migration, /INTERVAL '24 hours'/);
  assert.match(migration, /INTERVAL '7 days'/);
  assert.doesNotMatch(migration, /DELETE FROM "ResearchClaim"\s*;/);
});
