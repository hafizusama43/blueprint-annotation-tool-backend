import type { Calibration, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type CalibrationPayload = Prisma.CalibrationCreateInput;

export async function getAllCalibrations(userId: string): Promise<Calibration[]> {
    return prisma.calibration.findMany({
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

export async function getCalibrationById(id: string): Promise<Calibration | null> {
    return prisma.calibration.findUnique({
        where: { id },
    });
}

export async function createCalibration(data: CalibrationPayload): Promise<Calibration> {
    return prisma.calibration.create({
        data,
    });
}

export async function updateCalibration(
    id: string,
    data: Prisma.CalibrationUpdateInput,
): Promise<Calibration> {
    return prisma.calibration.update({
        where: { id },
        data,
    });
}

export async function deleteCalibration(id: string): Promise<Calibration> {
    return prisma.calibration.delete({
        where: { id },
    });
}
