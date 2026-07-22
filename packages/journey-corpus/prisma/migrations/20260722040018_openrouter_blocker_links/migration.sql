-- AlterTable
ALTER TABLE "GateBlockerLink" ADD COLUMN     "model" TEXT,
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "similarity" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CatalogEmbedding" (
    "reasonId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogEmbedding_pkey" PRIMARY KEY ("reasonId")
);

-- CreateIndex
CREATE INDEX "CatalogEmbedding_model_idx" ON "CatalogEmbedding"("model");
