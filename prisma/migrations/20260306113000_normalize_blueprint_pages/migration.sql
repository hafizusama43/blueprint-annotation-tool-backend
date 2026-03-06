-- Add page count to parent blueprint records.
ALTER TABLE "Blueprint"
ADD COLUMN "pageCount" INTEGER NOT NULL DEFAULT 1;

-- Create child table for drawable pages.
CREATE TABLE "BlueprintPage" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlueprintPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlueprintPage_blueprintId_pageNumber_key"
ON "BlueprintPage"("blueprintId", "pageNumber");

CREATE INDEX "BlueprintPage_blueprintId_idx"
ON "BlueprintPage"("blueprintId");

-- Backfill one logical page for any existing single-page blueprint rows.
INSERT INTO "BlueprintPage" (
    "id",
    "blueprintId",
    "pageNumber",
    "imageUrl",
    "width",
    "height",
    "createdAt",
    "updatedAt"
)
SELECT
    "id" || '-page-1',
    "id",
    1,
    "fileUrl",
    "width",
    "height",
    "createdAt",
    "updatedAt"
FROM "Blueprint";

-- Move Calibration from Blueprint -> BlueprintPage.
ALTER TABLE "Calibration"
ADD COLUMN "blueprintPageId" TEXT;

UPDATE "Calibration" AS c
SET "blueprintPageId" = bp."id"
FROM "BlueprintPage" AS bp
WHERE bp."blueprintId" = c."blueprintId"
  AND bp."pageNumber" = 1;

ALTER TABLE "Calibration"
ALTER COLUMN "blueprintPageId" SET NOT NULL;

ALTER TABLE "Calibration"
DROP CONSTRAINT "Calibration_blueprintId_fkey";

ALTER TABLE "Calibration"
DROP COLUMN "blueprintId";

CREATE INDEX "Calibration_blueprintPageId_idx"
ON "Calibration"("blueprintPageId");

ALTER TABLE "Calibration"
ADD CONSTRAINT "Calibration_blueprintPageId_fkey"
FOREIGN KEY ("blueprintPageId") REFERENCES "BlueprintPage"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Move Shape from Blueprint -> BlueprintPage.
ALTER TABLE "Shape"
ADD COLUMN "blueprintPageId" TEXT;

UPDATE "Shape" AS s
SET "blueprintPageId" = bp."id"
FROM "BlueprintPage" AS bp
WHERE bp."blueprintId" = s."blueprintId"
  AND bp."pageNumber" = 1;

ALTER TABLE "Shape"
ALTER COLUMN "blueprintPageId" SET NOT NULL;

ALTER TABLE "Shape"
DROP CONSTRAINT "Shape_blueprintId_fkey";

ALTER TABLE "Shape"
DROP COLUMN "blueprintId";

CREATE INDEX "Shape_blueprintPageId_idx"
ON "Shape"("blueprintPageId");

ALTER TABLE "Shape"
ADD CONSTRAINT "Shape_blueprintPageId_fkey"
FOREIGN KEY ("blueprintPageId") REFERENCES "BlueprintPage"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Width/height now belong to BlueprintPage.
ALTER TABLE "Blueprint"
DROP COLUMN "width",
DROP COLUMN "height";

-- Ensure deterministic point ordering within a shape.
CREATE UNIQUE INDEX "ShapePoint_shapeId_order_key"
ON "ShapePoint"("shapeId", "order");

CREATE INDEX "ShapePoint_shapeId_idx"
ON "ShapePoint"("shapeId");

ALTER TABLE "BlueprintPage"
ADD CONSTRAINT "BlueprintPage_blueprintId_fkey"
FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
