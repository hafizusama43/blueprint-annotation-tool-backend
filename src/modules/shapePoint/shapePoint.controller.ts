import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createError } from '../../middleware/error.middleware';
import { assertShapeAccess } from '../../services/permissions/permissions.service';
import * as shapePointService from './shapePoint.service';

const shapePointSchema = z.object({
    shapeId: z.string().cuid(),
    x: z.number(),
    y: z.number(),
    order: z.number().int(),
});

const updateShapePointSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    order: z.number().int().optional(),
});

export async function getAllShapePoints(_req: Request, res: Response, next: NextFunction) {
    try {
        if (!_req.auth) {
            return next(createError('Authentication required', 401));
        }
        const shapePoints = await shapePointService.getAllShapePoints(_req.auth.userId);
        res.json(shapePoints);
    } catch (error) {
        next(error);
    }
}

export async function getShapePointById(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const shapePoint = await shapePointService.getShapePointById(req.params.id);

        if (!shapePoint) {
            return next(createError('Shape point not found', 404));
        }

        res.json(shapePoint);
    } catch (error) {
        next(error);
    }
}

export async function createShapePoint(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const payload = shapePointSchema.parse(req.body);
        await assertShapeAccess(req.auth.userId, payload.shapeId);

        const createPayload: Prisma.ShapePointCreateInput = {
            shape: {
                connect: {
                    id: payload.shapeId,
                },
            },
            x: payload.x,
            y: payload.y,
            order: payload.order,
        };

        const created = await shapePointService.createShapePoint(createPayload);
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
}

export async function updateShapePoint(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const shapePoint = await shapePointService.getShapePointById(req.params.id);
        if (!shapePoint) {
            return next(createError('Shape point not found', 404));
        }
        await assertShapeAccess(req.auth.userId, shapePoint.shapeId);
        const payload = updateShapePointSchema.parse(req.body);
        const updated = await shapePointService.updateShapePoint(req.params.id, payload);
        res.json(updated);
    } catch (error) {
        next(error);
    }
}

export async function deleteShapePoint(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const shapePoint = await shapePointService.getShapePointById(req.params.id);
        if (!shapePoint) {
            return next(createError('Shape point not found', 404));
        }
        await assertShapeAccess(req.auth.userId, shapePoint.shapeId);
        const deleted = await shapePointService.deleteShapePoint(req.params.id);
        res.json(deleted);
    } catch (error) {
        next(error);
    }
}
