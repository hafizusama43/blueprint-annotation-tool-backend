import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createError } from '../../middleware/error.middleware';
import { assertBlueprintPageAccess } from '../../services/permissions/permissions.service';
import * as calibrationService from './calibration.service';

const calibrationSchema = z.object({
    blueprintPageId: z.string().cuid(),
    pixelsPerUnit: z.number().positive(),
    unit: z.string().min(1),
    referenceLabel: z.string().optional(),
    referenceStart: z.record(z.any()).optional(),
    referenceEnd: z.record(z.any()).optional(),
});

const updateCalibrationSchema = z.object({
    pixelsPerUnit: z.number().positive().optional(),
    unit: z.string().min(1).optional(),
    referenceLabel: z.string().nullable().optional(),
    referenceStart: z.record(z.any()).nullable().optional(),
    referenceEnd: z.record(z.any()).nullable().optional(),
});

export async function getAllCalibrations(_req: Request, res: Response, next: NextFunction) {
    try {
        if (!_req.auth) {
            return next(createError('Authentication required', 401));
        }
        const calibrations = await calibrationService.getAllCalibrations(_req.auth.userId);
        res.json(calibrations);
    } catch (error) {
        next(error);
    }
}

export async function getCalibrationById(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const calibration = await calibrationService.getCalibrationById(req.params.id);

        if (!calibration) {
            return next(createError('Calibration not found', 404));
        }

        await assertBlueprintPageAccess(req.auth.userId, calibration.blueprintPageId);

        res.json(calibration);
    } catch (error) {
        next(error);
    }
}

export async function createCalibration(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const payload = calibrationSchema.parse(req.body);
        await assertBlueprintPageAccess(req.auth.userId, payload.blueprintPageId);

        const createPayload: Prisma.CalibrationCreateInput = {
            blueprintPage: {
                connect: {
                    id: payload.blueprintPageId,
                },
            },
            ...(req.auth?.userId
                ? {
                      createdBy: {
                          connect: {
                              id: req.auth.userId,
                          },
                      },
                      updatedBy: {
                          connect: {
                              id: req.auth.userId,
                          },
                      },
                  }
                : {}),
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

export async function updateCalibration(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const existing = await calibrationService.getCalibrationById(req.params.id);
        if (!existing) {
            return next(createError('Calibration not found', 404));
        }
        await assertBlueprintPageAccess(req.auth.userId, existing.blueprintPageId);
        const payload = updateCalibrationSchema.parse(req.body);
        const updated = await calibrationService.updateCalibration(req.params.id, {
            ...(payload.pixelsPerUnit !== undefined ? { pixelsPerUnit: payload.pixelsPerUnit } : {}),
            ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
            ...(payload.referenceLabel !== undefined ? { referenceLabel: payload.referenceLabel } : {}),
            ...(payload.referenceStart !== undefined
                ? {
                      referenceStart:
                          payload.referenceStart === null
                              ? Prisma.JsonNull
                              : payload.referenceStart,
                  }
                : {}),
            ...(payload.referenceEnd !== undefined
                ? {
                      referenceEnd:
                          payload.referenceEnd === null ? Prisma.JsonNull : payload.referenceEnd,
                  }
                : {}),
            updatedBy: {
                connect: {
                    id: req.auth.userId,
                },
            },
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
}

export async function deleteCalibration(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const existing = await calibrationService.getCalibrationById(req.params.id);
        if (!existing) {
            return next(createError('Calibration not found', 404));
        }
        await assertBlueprintPageAccess(req.auth.userId, existing.blueprintPageId);
        const deleted = await calibrationService.deleteCalibration(req.params.id);
        res.json(deleted);
    } catch (error) {
        next(error);
    }
}
