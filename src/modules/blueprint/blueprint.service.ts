import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Blueprint, BlueprintPage, BlueprintProcessingStatus, Prisma } from '@prisma/client';
import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '../../config/prisma';
import { r2Client, R2_BUCKET, R2_PUBLIC_BASE_URL } from '../../config/r2';
import { createError } from '../../middleware/error.middleware';
import { uploadsDirectory } from '../../middleware/upload.middleware';

export type BlueprintPayload = Prisma.BlueprintCreateInput;
export type BlueprintWithPages = Blueprint & {
    pages: BlueprintPage[];
};
export type BlueprintStatus = Pick<
    Blueprint,
    'id' | 'processingStatus' | 'processingError' | 'processedAt' | 'pageCount' | 'updatedAt'
>;

function normalizePublicUrl(url: string | null): string | null {
    if (!url || !R2_PUBLIC_BASE_URL) {
        return url;
    }

    try {
        const configuredBase = new URL('https://pub-5a5d61ecb84741ba9f41b8310be99555.r2.dev');
        const parsed = new URL(url);
        const isKnownR2Host =
            parsed.hostname.endsWith('.r2.cloudflarestorage.com') ||
            parsed.hostname.endsWith('.r2.dev');

        if (!isKnownR2Host) {
            return url;
        }

        const normalizedPath = parsed.pathname.replace(/^\/+/, '');
        return `${configuredBase.toString().replace(/\/$/, '')}/${normalizedPath}`;
    } catch {
        return url;
    }
}

function normalizeBlueprintPublicUrls<T extends Blueprint>(blueprint: T): T {
    return {
        ...blueprint,
        fileUrl: normalizePublicUrl(blueprint.fileUrl) ?? blueprint.fileUrl,
    };
}

function normalizeBlueprintWithPagesPublicUrls(blueprint: BlueprintWithPages): BlueprintWithPages {
    return {
        ...normalizeBlueprintPublicUrls(blueprint),
        pages: blueprint.pages.map((page) => ({
            ...page,
            imageUrl: normalizePublicUrl(page.imageUrl),
            thumbnailUrl: normalizePublicUrl(page.thumbnailUrl),
        })),
    };
}

export async function getAllBlueprints(): Promise<Blueprint[]> {
    const blueprints = await prisma.blueprint.findMany({
        orderBy: {
            createdAt: 'desc',
        },
        // include: {
        //     pages: {
        //         orderBy: {
        //             pageNumber: 'asc',
        //         },
        //     },
        // },
    });

    return blueprints.map((blueprint) => normalizeBlueprintPublicUrls(blueprint));
}

export async function getBlueprintById(id: string): Promise<BlueprintWithPages | null> {
    const blueprint = await prisma.blueprint.findUnique({
        where: { id },
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });

    return blueprint ? normalizeBlueprintWithPagesPublicUrls(blueprint) : null;
}

export async function getBlueprintStatusById(id: string): Promise<BlueprintStatus | null> {
    return prisma.blueprint.findUnique({
        where: { id },
        select: {
            id: true,
            processingStatus: true,
            processingError: true,
            processedAt: true,
            pageCount: true,
            updatedAt: true,
        },
    });
}

export async function createBlueprint(data: BlueprintPayload): Promise<BlueprintWithPages> {
    return prisma.blueprint.create({
        data,
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });
}

export async function updateBlueprint(
    id: string,
    data: Prisma.BlueprintUpdateInput,
): Promise<BlueprintWithPages> {
    return prisma.blueprint.update({
        where: { id },
        data,
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });
}

export async function replaceBlueprintPagesAndMarkReady(
    blueprintId: string,
    pages: Prisma.BlueprintPageCreateManyBlueprintInput[],
): Promise<BlueprintWithPages> {
    return prisma.$transaction(async (tx) => {
        await tx.blueprintPage.deleteMany({
            where: { blueprintId },
        });

        if (pages.length > 0) {
            await tx.blueprintPage.createMany({
                data: pages.map((page) => ({
                    ...page,
                    blueprintId,
                })),
            });
        }

        return tx.blueprint.update({
            where: { id: blueprintId },
            data: {
                pageCount: pages.length,
                processingStatus: 'READY' satisfies BlueprintProcessingStatus,
                processingError: null,
                processedAt: new Date(),
            },
            include: {
                pages: {
                    orderBy: {
                        pageNumber: 'asc',
                    },
                },
            },
        });
    });
}

export async function resetBlueprintForProcessing(
    blueprintId: string,
): Promise<BlueprintWithPages> {
    return prisma.$transaction(async (tx) => {
        await tx.blueprintPage.deleteMany({
            where: { blueprintId },
        });

        return tx.blueprint.update({
            where: { id: blueprintId },
            data: {
                pageCount: 0,
                processingStatus: 'PROCESSING',
                processingError: null,
                processedAt: null,
            },
            include: {
                pages: {
                    orderBy: {
                        pageNumber: 'asc',
                    },
                },
            },
        });
    });
}

export async function deleteBlueprintById(id: string): Promise<BlueprintWithPages> {
    return prisma.blueprint.delete({
        where: { id },
        include: {
            pages: {
                orderBy: {
                    pageNumber: 'asc',
                },
            },
        },
    });
}

const PRESIGNED_EXPIRES_IN_SECONDS = 3600; // 1 hour

function sanitizeFileName(fileName: string): string {
    const base = fileName
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120);
    return base || 'file';
}

function buildObjectKey(fileName: string): string {
    const safeName = sanitizeFileName(fileName);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `raw-files/${unique}-${safeName}`;
}

function buildPublicFileUrl(key: string): string | null {
    return R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}` : null;
}

function buildLocalUploadFileName(originalFileName: string): string {
    const extension = path.extname(originalFileName).toLowerCase() || '.bin';
    const safeBaseName = path
        .basename(originalFileName, extension)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

    const finalBase = safeBaseName || 'blueprint';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    return `${finalBase}-${uniqueSuffix}${extension}`;
}

export type PresignedUploadResult = {
    uploadUrl: string;
    method: 'PUT';
    headers: Record<string, string>;
    key: string;
    fileUrl: string | null;
    expiresIn: number;
};

export type R2ObjectMetadata = {
    key: string;
    fileUrl: string;
    contentType: string | null;
    fileSizeBytes: number | null;
};

export type DownloadedR2Object = {
    filePath: string;
    fileName: string;
};

export type UploadedBlueprintPageImage = {
    imageUrl: string;
    width: number | null;
    height: number | null;
};

export async function getPresignedUploadUrl(
    fileName: string,
    contentType?: string,
): Promise<PresignedUploadResult> {
    const key = buildObjectKey(fileName);
    const headers: Record<string, string> = {};

    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ...(contentType && { ContentType: contentType }),
    });

    const uploadUrl = await getSignedUrl(r2Client, command, {
        expiresIn: PRESIGNED_EXPIRES_IN_SECONDS,
    });

    const fileUrl = buildPublicFileUrl(key);

    return {
        uploadUrl,
        method: 'PUT',
        headers,
        key,
        fileUrl,
        expiresIn: PRESIGNED_EXPIRES_IN_SECONDS,
    };
}

export async function getR2ObjectMetadata(key: string): Promise<R2ObjectMetadata> {
    const fileUrl = buildPublicFileUrl(key);
    if (!fileUrl) {
        throw createError('CF_R2_PUBLIC_BASE_URL must be configured to finalize uploads', 500);
    }

    try {
        const response = await r2Client.send(
            new HeadObjectCommand({
                Bucket: R2_BUCKET,
                Key: key,
            }),
        );

        return {
            key,
            fileUrl,
            contentType: response.ContentType ?? null,
            fileSizeBytes: response.ContentLength ?? null,
        };
    } catch (error) {
        throw createError('Uploaded file was not found in R2', 404, error);
    }
}

export async function downloadR2ObjectToUploads(
    key: string,
    originalFileName: string,
): Promise<DownloadedR2Object> {
    const fileName = buildLocalUploadFileName(originalFileName);
    const filePath = path.resolve(uploadsDirectory, fileName);

    await mkdir(uploadsDirectory, { recursive: true });

    const response = await r2Client.send(
        new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        }),
    );

    if (!response.Body) {
        throw createError('Uploaded file content is empty in R2', 400);
    }

    const writeStream = createWriteStream(filePath);
    await pipeline(response.Body as NodeJS.ReadableStream, writeStream);

    return { filePath, fileName };
}

export async function deleteR2Object(key: string): Promise<void> {
    await r2Client.send(
        new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        }),
    );
}

export function buildBlueprintPageImageKey(blueprintId: string, pageFileName: string): string {
    return `images/${blueprintId}/${pageFileName}`;
}

export function buildBlueprintPageThumbnailKey(
    blueprintId: string,
    thumbnailFileName: string,
): string {
    return `thumbnails/${blueprintId}/${thumbnailFileName}`;
}

export async function uploadFileToR2(
    key: string,
    localFilePath: string,
    contentType: string,
): Promise<string> {
    const fileUrl = buildPublicFileUrl(key);
    if (!fileUrl) {
        throw createError('CF_R2_PUBLIC_BASE_URL must be configured to upload page images', 500);
    }

    await r2Client.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: createReadStream(localFilePath),
            ContentType: contentType,
        }),
    );

    return fileUrl;
}

export async function deleteR2ObjectsByPrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
        const page = await r2Client.send(
            new ListObjectsV2Command({
                Bucket: R2_BUCKET,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }),
        );

        const keys = (page.Contents ?? [])
            .map((item) => item.Key)
            .filter((key): key is string => Boolean(key));

        if (keys.length > 0) {
            await r2Client.send(
                new DeleteObjectsCommand({
                    Bucket: R2_BUCKET,
                    Delete: {
                        Objects: keys.map((key) => ({ Key: key })),
                        Quiet: true,
                    },
                }),
            );
        }

        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
}
