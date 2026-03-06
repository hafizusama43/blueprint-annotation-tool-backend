import type { Prisma, Shape } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type ShapePayload = Prisma.ShapeCreateInput;

export async function getAllShapes(): Promise<Shape[]> {
    return prisma.shape.findMany({
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function getShapeById(id: string): Promise<Shape | null> {
    return prisma.shape.findUnique({
        where: { id },
    });
}

export async function createShape(data: ShapePayload): Promise<Shape> {
    return prisma.shape.create({
        data,
    });
}
