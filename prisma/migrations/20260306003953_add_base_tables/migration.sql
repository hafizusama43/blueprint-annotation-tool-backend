-- CreateEnum
CREATE TYPE "ShapeType" AS ENUM ('LINE', 'POLYLINE', 'POLYGON');

-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calibration" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "pixelsPerUnit" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "referenceLabel" TEXT,
    "referenceStart" JSONB,
    "referenceEnd" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shape" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "type" "ShapeType" NOT NULL,
    "label" TEXT,
    "measurement" DOUBLE PRECISION,
    "unit" TEXT,
    "fillColor" TEXT,
    "strokeColor" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShapePoint" (
    "id" TEXT NOT NULL,
    "shapeId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ShapePoint_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Calibration" ADD CONSTRAINT "Calibration_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shape" ADD CONSTRAINT "Shape_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShapePoint" ADD CONSTRAINT "ShapePoint_shapeId_fkey" FOREIGN KEY ("shapeId") REFERENCES "Shape"("id") ON DELETE CASCADE ON UPDATE CASCADE;
