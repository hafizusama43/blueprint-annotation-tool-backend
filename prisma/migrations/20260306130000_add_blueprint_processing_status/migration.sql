-- CreateEnum
CREATE TYPE "BlueprintProcessingStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Blueprint"
ADD COLUMN "processingStatus" "BlueprintProcessingStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN "processingError" TEXT,
ADD COLUMN "processedAt" TIMESTAMP(3),
ALTER COLUMN "pageCount" SET DEFAULT 0;

-- Backfill existing records as ready.
UPDATE "Blueprint"
SET "processingStatus" = 'READY',
    "processedAt" = COALESCE("processedAt", "updatedAt")
WHERE "processingStatus" IS NULL OR "processedAt" IS NULL;
