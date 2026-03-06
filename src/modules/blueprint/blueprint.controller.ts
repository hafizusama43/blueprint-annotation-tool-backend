import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import * as blueprintService from './blueprint.service';
import { createError } from '../../middleware/error.middleware';

const blueprintSchema = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    fileUrl: z.string().min(2),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    metadata: z.record(z.any()).optional(),
});

export async function getAllBlueprints(_req: Request, res: Response, next: NextFunction) {
    try {
        const blueprints = await blueprintService.getAllBlueprints();
        res.json(blueprints);
    } catch (error) {
        next(error);
    }
}

export async function getBlueprintById(req: Request, res: Response, next: NextFunction) {
    try {
        const blueprint = await blueprintService.getBlueprintById(req.params.id);

        if (!blueprint) {
            return next(createError('Blueprint not found', 404));
        }

        res.json(blueprint);
    } catch (error) {
        next(error);
    }
}

export async function createBlueprint(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = blueprintSchema.parse(req.body);

        const createPayload: Prisma.BlueprintCreateInput = {
            name: payload.name,
            description: payload.description ?? null,
            fileUrl: payload.fileUrl,
            width: payload.width ?? null,
            height: payload.height ?? null,
            metadata: payload.metadata ?? undefined,
        };

        const created = await blueprintService.createBlueprint(createPayload);
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
}
