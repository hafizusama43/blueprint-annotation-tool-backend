import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createError } from '../../middleware/error.middleware';
import * as calibrationService from './calibration.service';

const calibrationSchema = z.object({
    blueprintId: z.string().cuid(),
    pixelsPerUnit: z.number().positive(),
    unit: z.string().min(1),
    referenceLabel: z.string().optional(),
    referenceStart: z.record(z.any()).optional(),
    referenceEnd: z.record(z.any()).optional(),
});

export async function getAllCalibrations(_req: Request, res: Response, next: NextFunction) {
    try {
        const calibrations = await calibrationService.getAllCalibrations();
        res.json(calibrations);
    } catch (error) {
        next(error);
    }
}

export async function getCalibrationById(req: Request, res: Response, next: NextFunction) {
    try {
        const calibration = await calibrationService.getCalibrationById(req.params.id);

        if (!calibration) {
            return next(createError('Calibration not found', 404));
        }

        res.json(calibration);
    } catch (error) {
        next(error);
    }
}

export async function createCalibration(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = calibrationSchema.parse(req.body);

        const createPayload: Prisma.CalibrationCreateInput = {
            blueprint: {
                connect: {
                    id: payload.blueprintId,
                },
            },
            pixelsPerUnit: payload.pixelsPerUnit,
            unit: payload.unit,
            referenceLabel: payload.referenceLabel ?? null,
            referenceStart: payload.referenceStart ?? undefined,
            referenceEnd: payload.referenceEnd ?? undefined,
        };

        const created = await calibrationService.createCalibration(createPayload);
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
}
