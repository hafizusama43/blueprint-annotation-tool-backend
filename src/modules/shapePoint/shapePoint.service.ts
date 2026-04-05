import type { Prisma, ShapePoint } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type ShapePointPayload = Prisma.ShapePointCreateInput;

export async function getAllShapePoints(userId: string): Promise<ShapePoint[]> {
    return prisma.shapePoint.findMany({
        where: {
            OR: [
                {
                    shape: {
                        blueprintPage: {
                            blueprint: {
                                project: {
                                    organization: {
                                        memberships: {
                                            some: {
                                                userId,
                                                status: 'ACTIVE',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                {
                    shape: {
                        blueprintPage: {
                            blueprint: {
                                project: {
                                    collaborators: {
                                        some: {
                                            userId,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
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

export async function updateShapePoint(
    id: string,
    data: Prisma.ShapePointUpdateInput,
): Promise<ShapePoint> {
    return prisma.shapePoint.update({
        where: { id },
        data,
    });
}

export async function deleteShapePoint(id: string): Promise<ShapePoint> {
    return prisma.shapePoint.delete({
        where: { id },
    });
}
