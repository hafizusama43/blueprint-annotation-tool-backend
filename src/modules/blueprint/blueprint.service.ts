import type { Blueprint, BlueprintPage, BlueprintProcessingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type BlueprintPayload = Prisma.BlueprintCreateInput;
export type BlueprintWithPages = Blueprint & {
    pages: BlueprintPage[];
};
export type BlueprintStatus = Pick<
    Blueprint,
    'id' | 'processingStatus' | 'processingError' | 'processedAt' | 'pageCount' | 'updatedAt'
>;

export async function getAllBlueprints(): Promise<Blueprint[]> {
    return prisma.blueprint.findMany({
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function getBlueprintById(id: string): Promise<BlueprintWithPages | null> {
    return prisma.blueprint.findUnique({
        where: { id },
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });
}

export async function getBlueprintStatusById(id: string): Promise<BlueprintStatus | null> {
    return prisma.blueprint.findUnique({
        where: { id },
        select: {
            id: true,
            processingStatus: true,
            processingError: true,
            processedAt: true,
            pageCount: true,
            updatedAt: true,
        },
    });
}

export async function createBlueprint(data: BlueprintPayload): Promise<BlueprintWithPages> {
    return prisma.blueprint.create({
        data,
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });
}

export async function updateBlueprint(
    id: string,
    data: Prisma.BlueprintUpdateInput,
): Promise<BlueprintWithPages> {
    return prisma.blueprint.update({
        where: { id },
        data,
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });
}

export async function replaceBlueprintPagesAndMarkReady(
    blueprintId: string,
    pages: Prisma.BlueprintPageCreateManyBlueprintInput[],
): Promise<BlueprintWithPages> {
    return prisma.$transaction(async (tx) => {
        await tx.blueprintPage.deleteMany({
            where: { blueprintId },
        });

        if (pages.length > 0) {
            await tx.blueprintPage.createMany({
                data: pages.map((page) => ({
                    ...page,
                    blueprintId,
                })),
            });
        }

        return tx.blueprint.update({
            where: { id: blueprintId },
            data: {
                pageCount: pages.length,
                processingStatus: 'READY' satisfies BlueprintProcessingStatus,
                processingError: null,
                processedAt: new Date(),
            },
            include: {
                pages: {
                    orderBy: {
                        pageNumber: 'asc',
                    },
                },
            },
        });
    });
}

export async function resetBlueprintForProcessing(
    blueprintId: string,
): Promise<BlueprintWithPages> {
    return prisma.$transaction(async (tx) => {
        await tx.blueprintPage.deleteMany({
            where: { blueprintId },
        });

        return tx.blueprint.update({
            where: { id: blueprintId },
            data: {
                pageCount: 0,
                processingStatus: 'PROCESSING',
                processingError: null,
                processedAt: null,
            },
            include: {
                pages: {
                    orderBy: {
                        pageNumber: 'asc',
                    },
                },
            },
        });
    });
}

export async function deleteBlueprintById(id: string): Promise<BlueprintWithPages> {
    return prisma.blueprint.delete({
        where: { id },
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });
}
