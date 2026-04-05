import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ShapeType } from '@prisma/client';
import type { Prisma, Shape } from '@prisma/client';
import { createError } from '../../middleware/error.middleware';
import { assertBlueprintPageAccess, assertShapeAccess } from '../../services/permissions/permissions.service';
import * as shapeService from './shape.service';

const shapeSchema = z.object({
    blueprintPageId: z.string().cuid(),
    type: z.nativeEnum(ShapeType),
    label: z.string().max(128).optional(),
    measurement: z.number().optional(),
    unit: z.string().optional(),
    fillColor: z.string().optional(),
    strokeColor: z.string().optional(),
    metadata: z.record(z.any()).optional(),
});

const updateShapeSchema = z.object({
    label: z.string().max(128).nullable().optional(),
    measurement: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    fillColor: z.string().nullable().optional(),
    strokeColor: z.string().nullable().optional(),
    metadata: z.record(z.any()).optional(),
});

export async function getAllShapes(_req: Request, res: Response, next: NextFunction) {
    try {
        if (!_req.auth) {
            return next(createError('Authentication required', 401));
        }
        const shapes = await shapeService.getAllShapes(_req.auth.userId);
        res.json(shapes);
    } catch (error) {
        next(error);
    }
}

export async function getShapeById(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertShapeAccess(req.auth.userId, req.params.id);
        const shape = await shapeService.getShapeById(req.params.id);

        if (!shape) {
            return next(createError('Shape not found', 404));
        }

        res.json(shape);
    } catch (error) {
        next(error);
    }
}

export async function createShape(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const payload = shapeSchema.parse(req.body);
        await assertBlueprintPageAccess(req.auth.userId, payload.blueprintPageId);

        const createPayload: Prisma.ShapeCreateInput = {
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
            type: payload.type,
            label: payload.label ?? null,
            measurement: payload.measurement ?? null,
            unit: payload.unit ?? null,
            fillColor: payload.fillColor ?? null,
            strokeColor: payload.strokeColor ?? null,
            metadata: payload.metadata ?? undefined,
        };

        const created = await shapeService.createShape(createPayload);
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
}

export async function updateShape(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertShapeAccess(req.auth.userId, req.params.id);
        const payload = updateShapeSchema.parse(req.body);
        const updated = await shapeService.updateShape(req.params.id, {
            ...(payload.label !== undefined ? { label: payload.label } : {}),
            ...(payload.measurement !== undefined ? { measurement: payload.measurement } : {}),
            ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
            ...(payload.fillColor !== undefined ? { fillColor: payload.fillColor } : {}),
            ...(payload.strokeColor !== undefined ? { strokeColor: payload.strokeColor } : {}),
            ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
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

export async function deleteShape(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertShapeAccess(req.auth.userId, req.params.id);
        const deleted = await shapeService.deleteShape(req.params.id);
        res.json(deleted);
    } catch (error) {
        next(error);
    }
}
