import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { createError } from '../../middleware/error.middleware';
import * as shapePointService from './shapePoint.service';

const shapePointSchema = z.object({
    shapeId: z.string().cuid(),
    x: z.number(),
    y: z.number(),
    order: z.number().int(),
});

export async function getAllShapePoints(_req: Request, res: Response, next: NextFunction) {
    try {
        const shapePoints = await shapePointService.getAllShapePoints();
        res.json(shapePoints);
    } catch (error) {
        next(error);
    }
}

export async function getShapePointById(req: Request, res: Response, next: NextFunction) {
    try {
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
        const payload = shapePointSchema.parse(req.body);

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
