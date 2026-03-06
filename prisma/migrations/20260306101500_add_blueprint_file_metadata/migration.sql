-- AlterTable
ALTER TABLE "Blueprint"
ADD COLUMN "originalFileName" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "fileSizeBytes" INTEGER;
