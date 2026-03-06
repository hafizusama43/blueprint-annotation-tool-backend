import type { Blueprint, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type BlueprintPayload = Prisma.BlueprintCreateInput;

export async function getAllBlueprints(): Promise<Blueprint[]> {
    return prisma.blueprint.findMany({
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function getBlueprintById(id: string): Promise<Blueprint | null> {
    return prisma.blueprint.findUnique({
        where: { id },
    });
}

export async function createBlueprint(data: BlueprintPayload): Promise<Blueprint> {
    return prisma.blueprint.create({
        data,
    });
}
