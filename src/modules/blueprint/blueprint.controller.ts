import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BlueprintProcessingStatus, type Prisma } from '@prisma/client';
import * as blueprintService from './blueprint.service';
import { createError } from '../../middleware/error.middleware';
import { enqueuePdfBlueprintProcessing } from './blueprint.processor';
import { uploadsDirectory } from '../../middleware/upload.middleware';

const blueprintSchema = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    fileUrl: z.string().min(2),
    pageCount: z.number().int().positive().optional(),
    metadata: z.record(z.any()).optional(),
});

const uploadBlueprintSchema = z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional(),
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

function resolveUploadsPathFromUrl(fileUrl: string): string | null {
    const normalized = fileUrl.replace(/\\/g, '/');
    const uploadsPrefix = '/uploads/';
    if (!normalized.startsWith(uploadsPrefix)) {
        return null;
    }

    const relativePath = normalized.slice(uploadsPrefix.length);
    const absolutePath = path.resolve(uploadsDirectory, relativePath);
    const uploadsRoot = path.resolve(uploadsDirectory);
    const uploadsRootWithSep = `${uploadsRoot}${path.sep}`;

    if (absolutePath === uploadsRoot || !absolutePath.startsWith(uploadsRootWithSep)) {
        return null;
    }

    return absolutePath;
}

function getPdfPagesDirectoryPathFromFileUrl(fileUrl: string): string | null {
    const uploadedFilePath = resolveUploadsPathFromUrl(fileUrl);
    if (!uploadedFilePath) {
        return null;
    }

    const fileName = path.basename(uploadedFilePath);
    const pageDirName = `${path.basename(fileName, path.extname(fileName))}-pages`;
    const directoryPath = path.resolve(uploadsDirectory, pageDirName);
    const uploadsRoot = path.resolve(uploadsDirectory);
    const uploadsRootWithSep = `${uploadsRoot}${path.sep}`;

    if (!directoryPath.startsWith(uploadsRootWithSep)) {
        return null;
    }

    return directoryPath;
}

async function cleanupBlueprintFiles(blueprint: {
    fileUrl: string;
    mimeType: string | null;
}): Promise<void> {
    const uploadedFilePath = resolveUploadsPathFromUrl(blueprint.fileUrl);
    if (uploadedFilePath) {
        try {
            await rm(uploadedFilePath, { force: true });
        } catch (error) {
            console.error('Failed to delete uploaded blueprint file', error);
        }
    }

    if (blueprint.mimeType === 'application/pdf') {
        const pdfPagesDirectoryPath = getPdfPagesDirectoryPathFromFileUrl(blueprint.fileUrl);
        if (pdfPagesDirectoryPath) {
            try {
                await rm(pdfPagesDirectoryPath, { recursive: true, force: true });
            } catch (error) {
                console.error('Failed to delete blueprint page images', error);
            }
        }
    }
}

function buildBlueprintPages(
    pages: Array<{
        imageUrl: string | null;
        width?: number | null;
        height?: number | null;
    }>,
): Prisma.BlueprintPageCreateWithoutBlueprintInput[] {
    return pages.map((page, index) => ({
        pageNumber: index + 1,
        imageUrl: page.imageUrl,
        width: page.width ?? null,
        height: page.height ?? null,
    }));
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

export async function getBlueprintProcessingStatus(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const status = await blueprintService.getBlueprintStatusById(req.params.id);

        if (!status) {
            return next(createError('Blueprint not found', 404));
        }

        res.json(status);
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
            pageCount: payload.pageCount ?? 1,
            metadata: payload.metadata ?? undefined,
            pages: {
                create: buildBlueprintPages(
                    Array.from({ length: payload.pageCount ?? 1 }, () => ({
                        imageUrl: (payload.pageCount ?? 1) === 1 ? payload.fileUrl : null,
                    })),
                ),
            },
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
        const isPdf = req.file.mimetype === 'application/pdf';
        const createPayload: Prisma.BlueprintCreateInput = {
            name: payload.name ?? createDefaultBlueprintName(req.file.originalname),
            description: payload.description ?? null,
            fileUrl,
            originalFileName: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSizeBytes: req.file.size,
            pageCount: isPdf ? 0 : 1,
            processingStatus: isPdf
                ? BlueprintProcessingStatus.PROCESSING
                : BlueprintProcessingStatus.READY,
            processedAt: isPdf ? null : new Date(),
            metadata,
            ...(isPdf
                ? {}
                : {
                      pages: {
                          create: buildBlueprintPages([{ imageUrl: fileUrl }]),
                      },
                  }),
        };

        const created = await blueprintService.createBlueprint(createPayload);

        if (isPdf) {
            enqueuePdfBlueprintProcessing({
                blueprintId: created.id,
                filePath: req.file.path,
                fileName: req.file.filename,
            });
        }

        res.status(isPdf ? 202 : 201).json(created);
    } catch (error) {
        next(error);
    }
}

export async function retryBlueprintProcessing(req: Request, res: Response, next: NextFunction) {
    try {
        const blueprint = await blueprintService.getBlueprintById(req.params.id);

        if (!blueprint) {
            return next(createError('Blueprint not found', 404));
        }

        if (blueprint.mimeType !== 'application/pdf') {
            return next(createError('Only PDF blueprints can be reprocessed', 400));
        }

        if (blueprint.processingStatus === BlueprintProcessingStatus.PROCESSING) {
            return next(createError('Blueprint is already being processed', 409));
        }

        const filePath = resolveUploadsPathFromUrl(blueprint.fileUrl);
        if (!filePath) {
            return next(createError('Invalid blueprint file path', 400));
        }

        try {
            await access(filePath);
        } catch {
            return next(createError('Original blueprint file not found on disk', 404));
        }

        const updated = await blueprintService.resetBlueprintForProcessing(blueprint.id);

        enqueuePdfBlueprintProcessing({
            blueprintId: blueprint.id,
            filePath,
            fileName: path.basename(filePath),
        });

        res.status(202).json(updated);
    } catch (error) {
        next(error);
    }
}

export async function deleteBlueprint(req: Request, res: Response, next: NextFunction) {
    try {
        const blueprint = await blueprintService.getBlueprintById(req.params.id);
        if (!blueprint) {
            return next(createError('Blueprint not found', 404));
        }

        await blueprintService.deleteBlueprintById(blueprint.id);

        // Best-effort cleanup for original upload and generated page images.
        await cleanupBlueprintFiles({
            fileUrl: blueprint.fileUrl,
            mimeType: blueprint.mimeType ?? null,
        });

        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
