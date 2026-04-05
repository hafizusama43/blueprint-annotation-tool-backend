import type { Prisma, Shape } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type ShapePayload = Prisma.ShapeCreateInput;

export async function getAllShapes(userId: string): Promise<Shape[]> {
    return prisma.shape.findMany({
        where: {
            OR: [
                {
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
                {
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
            ],
        },
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

export async function updateShape(
    id: string,
    data: Prisma.ShapeUpdateInput,
): Promise<Shape> {
    return prisma.shape.update({
        where: { id },
        data,
    });
}

export async function deleteShape(id: string): Promise<Shape> {
    return prisma.shape.delete({
        where: { id },
    });
}
