DROP INDEX IF EXISTS "ResearchClaim_clientIp_startedAt_idx";
ALTER TABLE "ResearchClaim" DROP COLUMN IF EXISTS "clientIp";

UPDATE "ResearchClaim"
SET "status" = 'failed'
WHERE "status" IN ('claiming', 'pending')
  AND "updatedAt" < NOW() - INTERVAL '24 hours';

DELETE FROM "ResearchClaim"
WHERE "status" IN ('completed', 'failed')
  AND "updatedAt" < NOW() - INTERVAL '7 days';
