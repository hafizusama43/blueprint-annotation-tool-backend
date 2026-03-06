import type { Prisma, ShapePoint } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type ShapePointPayload = Prisma.ShapePointCreateInput;

export async function getAllShapePoints(): Promise<ShapePoint[]> {
    return prisma.shapePoint.findMany({
        orderBy: {
            order: 'asc',
        },
    });
}

export async function getShapePointById(id: string): Promise<ShapePoint | null> {
    return prisma.shapePoint.findUnique({
        where: { id },
    });
}

export async function createShapePoint(data: ShapePointPayload): Promise<ShapePoint> {
    return prisma.shapePoint.create({
        data,
    });
}
