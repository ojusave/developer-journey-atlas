-- CreateTable
CREATE TABLE "Platform" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "category" TEXT NOT NULL,
    "researchedAt" TEXT,
    "researchStatus" TEXT,
    "recordJson" JSONB NOT NULL,
    "sourceSha256" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "JourneyStep" (
    "id" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "phase" TEXT,
    "actor" TEXT,
    "interface" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "successSignal" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sourceIds" JSONB,

    CONSTRAINT "JourneyStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrictionGate" (
    "id" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "atStep" INTEGER,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "documentedRequirement" BOOLEAN,
    "sourceIds" JSONB,

    CONSTRAINT "FrictionGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "platformSlug" TEXT NOT NULL,
    "auditStatus" TEXT NOT NULL,
    "auditedAt" TEXT,
    "sourceRecordSha256" TEXT,
    "countsJson" JSONB,
    "auditJson" JSONB NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("platformSlug")
);

-- CreateTable
CREATE TABLE "Metric" (
    "platformSlug" TEXT NOT NULL,
    "metricJson" JSONB NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("platformSlug")
);

-- CreateTable
CREATE TABLE "Quality" (
    "platformSlug" TEXT NOT NULL,
    "decisionCount" INTEGER NOT NULL,
    "reResearched" BOOLEAN NOT NULL,
    "comparabilityStatus" TEXT NOT NULL,

    CONSTRAINT "Quality_pkey" PRIMARY KEY ("platformSlug")
);

-- CreateTable
CREATE TABLE "CatalogNode" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "scope" TEXT,
    "catalogMaturity" TEXT,
    "diagnosticEligibility" TEXT,
    "sourceLine" INTEGER,
    "payloadJson" JSONB,

    CONSTRAINT "CatalogNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogEdge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provenance" TEXT,
    "reviewState" TEXT,

    CONSTRAINT "CatalogEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateTypeFamilyMap" (
    "gateType" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,

    CONSTRAINT "GateTypeFamilyMap_pkey" PRIMARY KEY ("gateType")
);

-- CreateTable
CREATE TABLE "GateBlockerLink" (
    "id" TEXT NOT NULL,
    "frictionGateId" TEXT NOT NULL,
    "blockerReasonId" TEXT NOT NULL,
    "linkSource" TEXT NOT NULL,
    "confidence" TEXT,

    CONSTRAINT "GateBlockerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetMeta" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "metaJson" JSONB NOT NULL,

    CONSTRAINT "DatasetMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyStep_platformSlug_idx" ON "JourneyStep"("platformSlug");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyStep_platformSlug_stepNumber_key" ON "JourneyStep"("platformSlug", "stepNumber");

-- CreateIndex
CREATE INDEX "FrictionGate_platformSlug_atStep_idx" ON "FrictionGate"("platformSlug", "atStep");

-- CreateIndex
CREATE INDEX "FrictionGate_type_idx" ON "FrictionGate"("type");

-- CreateIndex
CREATE INDEX "CatalogNode_kind_idx" ON "CatalogNode"("kind");

-- CreateIndex
CREATE INDEX "CatalogNode_parentId_idx" ON "CatalogNode"("parentId");

-- CreateIndex
CREATE INDEX "CatalogEdge_fromId_idx" ON "CatalogEdge"("fromId");

-- CreateIndex
CREATE INDEX "CatalogEdge_toId_idx" ON "CatalogEdge"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEdge_fromId_toId_type_key" ON "CatalogEdge"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "GateBlockerLink_blockerReasonId_idx" ON "GateBlockerLink"("blockerReasonId");

-- CreateIndex
CREATE UNIQUE INDEX "GateBlockerLink_frictionGateId_blockerReasonId_linkSource_key" ON "GateBlockerLink"("frictionGateId", "blockerReasonId", "linkSource");

-- AddForeignKey
ALTER TABLE "JourneyStep" ADD CONSTRAINT "JourneyStep_platformSlug_fkey" FOREIGN KEY ("platformSlug") REFERENCES "Platform"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrictionGate" ADD CONSTRAINT "FrictionGate_platformSlug_fkey" FOREIGN KEY ("platformSlug") REFERENCES "Platform"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_platformSlug_fkey" FOREIGN KEY ("platformSlug") REFERENCES "Platform"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_platformSlug_fkey" FOREIGN KEY ("platformSlug") REFERENCES "Platform"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quality" ADD CONSTRAINT "Quality_platformSlug_fkey" FOREIGN KEY ("platformSlug") REFERENCES "Platform"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateBlockerLink" ADD CONSTRAINT "GateBlockerLink_frictionGateId_fkey" FOREIGN KEY ("frictionGateId") REFERENCES "FrictionGate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
