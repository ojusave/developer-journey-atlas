-- Durable research claims so concurrent developers share one Workflow run per platform.
CREATE TABLE "ResearchClaim" (
    "slug" TEXT NOT NULL,
    "runId" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "clientIp" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchClaim_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "ResearchClaim_status_startedAt_idx" ON "ResearchClaim"("status", "startedAt");
CREATE INDEX "ResearchClaim_clientIp_startedAt_idx" ON "ResearchClaim"("clientIp", "startedAt");
