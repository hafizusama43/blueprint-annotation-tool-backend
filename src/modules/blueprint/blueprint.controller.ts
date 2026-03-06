import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { Request, Response, NextFunction } from 'express';
import { BlueprintProcessingStatus, type Prisma } from '@prisma/client';
import * as blueprintService from './blueprint.service';
import { createError } from '../../middleware/error.middleware';
import { enqueuePdfBlueprintProcessing } from './blueprint.processor';
import { uploadsDirectory } from '../../middleware/upload.middleware';
import {
    blueprintSchema,
    uploadBlueprintSchema,
    type PresignedUploadRequest,
    type UploadBlueprintRequest,
} from '../../schemas/blueprint.schemas';

const allowedBlueprintMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);

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

function attachR2Metadata(
    metadata: Prisma.InputJsonValue | undefined,
    key: string,
): Prisma.InputJsonObject {
    const baseMetadata =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? (metadata as Prisma.InputJsonObject)
            : {};

    return {
        ...baseMetadata,
        storage: {
            provider: 'r2',
            key,
        },
    };
}

function getR2ObjectKeyFromMetadata(metadata: Prisma.JsonValue | null): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
    }

    const storage = (metadata as Record<string, unknown>).storage;
    if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
        return null;
    }

    const provider = (storage as Record<string, unknown>).provider;
    const key = (storage as Record<string, unknown>).key;

    return provider === 'r2' && typeof key === 'string' && key.length > 0 ? key : null;
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
    metadata: Prisma.JsonValue | null;
}): Promise<void> {
    const r2ObjectKey = getR2ObjectKeyFromMetadata(blueprint.metadata);
    if (r2ObjectKey) {
        try {
            await blueprintService.deleteR2Object(r2ObjectKey);
        } catch (error) {
            console.error('Failed to delete R2 blueprint file', error);
        }
    }

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
        const payload = req.body as UploadBlueprintRequest;
        const metadata = parseMetadata(payload.metadata);
        const r2Object = await blueprintService.getR2ObjectMetadata(payload.key);

        if (!r2Object.contentType || !allowedBlueprintMimeTypes.has(r2Object.contentType)) {
            return next(createError('Only PDF, PNG, JPG, and JPEG files are allowed.', 400));
        }

        const fileUrl = payload.fileUrl ?? r2Object.fileUrl;
        const isPdf = r2Object.contentType === 'application/pdf';
        const createPayload: Prisma.BlueprintCreateInput = {
            name: payload.name ?? createDefaultBlueprintName(payload.originalFileName),
            description: payload.description ?? null,
            fileUrl,
            originalFileName: payload.originalFileName,
            mimeType: r2Object.contentType,
            fileSizeBytes: r2Object.fileSizeBytes,
            pageCount: isPdf ? 0 : 1,
            processingStatus: isPdf
                ? BlueprintProcessingStatus.PROCESSING
                : BlueprintProcessingStatus.READY,
            processedAt: isPdf ? null : new Date(),
            metadata: attachR2Metadata(metadata, payload.key),
        };

        const created = await blueprintService.createBlueprint(createPayload);

        // if (isPdf) {
        //     const downloadedFile = await blueprintService.downloadR2ObjectToUploads(
        //         payload.key,
        //         payload.originalFileName,
        //     );

        //     enqueuePdfBlueprintProcessing({
        //         blueprintId: created.id,
        //         filePath: downloadedFile.filePath,
        //         fileName: downloadedFile.fileName,
        //         cleanupSourceFile: true,
        //     });
        // }

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

        const updated = await blueprintService.resetBlueprintForProcessing(blueprint.id);
        const localFilePath = resolveUploadsPathFromUrl(blueprint.fileUrl);
        const r2ObjectKey = getR2ObjectKeyFromMetadata(blueprint.metadata);

        let filePath: string;
        let fileName: string;
        let cleanupSourceFile = false;

        if (localFilePath) {
            try {
                await access(localFilePath);
            } catch {
                return next(createError('Original blueprint file not found on disk', 404));
            }

            filePath = localFilePath;
            fileName = path.basename(localFilePath);
        } else if (r2ObjectKey && blueprint.originalFileName) {
            const downloadedFile = await blueprintService.downloadR2ObjectToUploads(
                r2ObjectKey,
                blueprint.originalFileName,
            );
            filePath = downloadedFile.filePath;
            fileName = downloadedFile.fileName;
            cleanupSourceFile = true;
        } else {
            return next(createError('Original blueprint file could not be resolved for retry', 400));
        }

        enqueuePdfBlueprintProcessing({
            blueprintId: blueprint.id,
            filePath,
            fileName,
            cleanupSourceFile,
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
            metadata: blueprint.metadata,
        });

        res.status(204).send();
    } catch (error) {
        next(error);
    }
}


export async function getPreSignedUrl(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = req.body as PresignedUploadRequest;
        const result = await blueprintService.getPresignedUploadUrl(
            payload.fileName,
            payload.contentType,
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
}