import type { Calibration, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type CalibrationPayload = Prisma.CalibrationCreateInput;

export async function getAllCalibrations(): Promise<Calibration[]> {
    return prisma.calibration.findMany({
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
