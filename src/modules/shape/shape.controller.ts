import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ShapeType } from '@prisma/client';
import type { Prisma, Shape } from '@prisma/client';
import { createError } from '../../middleware/error.middleware';
import * as shapeService from './shape.service';

const shapeSchema = z.object({
    blueprintId: z.string().cuid(),
    type: z.nativeEnum(ShapeType),
    label: z.string().max(128).optional(),
    measurement: z.number().optional(),
    unit: z.string().optional(),
    fillColor: z.string().optional(),
    strokeColor: z.string().optional(),
    metadata: z.record(z.any()).optional(),
});

export async function getAllShapes(_req: Request, res: Response, next: NextFunction) {
    try {
        const shapes = await shapeService.getAllShapes();
        res.json(shapes);
    } catch (error) {
        next(error);
    }
}

export async function getShapeById(req: Request, res: Response, next: NextFunction) {
    try {
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
        const payload = shapeSchema.parse(req.body);

        const createPayload: Prisma.ShapeCreateInput = {
            blueprint: {
                connect: {
                    id: payload.blueprintId,
                },
            },
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
