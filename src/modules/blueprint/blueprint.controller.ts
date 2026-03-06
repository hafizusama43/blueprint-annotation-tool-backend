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

const uploadBlueprintSchema = z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional(),
    metadata: z.string().optional(),
});

function parseMetadata(metadataInput: string | undefined): Prisma.InputJsonValue | undefined {
    if (!metadataInput) {
        return undefined;
    }

    const parsed = JSON.parse(metadataInput) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw createError('metadata must be a valid JSON object', 400);
    }

    return parsed as Prisma.InputJsonValue;
}

function createDefaultBlueprintName(originalName: string): string {
    const withoutExtension = originalName.replace(/\.[^/.]+$/, '').trim();
    return withoutExtension.length > 0 ? withoutExtension : 'Blueprint';
}

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

export async function uploadBlueprint(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.file) {
            return next(createError('Blueprint file is required (field name: file)', 400));
        }

        const payload = uploadBlueprintSchema.parse(req.body);
        const metadata = parseMetadata(payload.metadata);
        const fileUrl = `/uploads/${req.file.filename}`;
        const createPayload: Prisma.BlueprintCreateInput = {
            name: payload.name ?? createDefaultBlueprintName(req.file.originalname),
            description: payload.description ?? null,
            fileUrl,
            originalFileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSizeBytes: req.file.size,
            width: payload.width ?? null,
            height: payload.height ?? null,
            metadata,
        };

        const created = await blueprintService.createBlueprint(createPayload);
        res.status(201).json(created);
    } catch (error) {
        next(error);
    }
}
