import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { pdfToPng, type PngPageOutput } from 'pdf-to-png-converter';
import sharp from 'sharp';
import { extractPageDetails } from '../../services/ai/ai.service';
import {
    BlueprintQueueMessage,
    deleteBlueprintJob,
    enqueueBlueprintJob,
    receiveBlueprintJobs,
} from '../../services/queue/blueprintQueue.service';
import { uploadsDirectory } from '../../middleware/upload.middleware';
import * as blueprintService from './blueprint.service';

export type ProcessingJob = {
    blueprintId: string;
    filePath: string;
    fileName: string;
    cleanupSourceFile?: boolean;
};

type PageAsset = {
    imagePath: string;
    imageName: string;
    thumbnailPath: string;
    thumbnailName: string;
    width?: number | null;
    height?: number | null;
};

const PAGE_UPLOAD_CONCURRENCY = 8;
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_QUALITY = 70;
const THUMBNAIL_SUFFIX = '-thumb.webp';

function getPdfPageDirectoryName(fileName: string): string {
    const fileBaseName = path.basename(fileName, path.extname(fileName));
    return `${fileBaseName}-pages`;
}

function getPdfPageDirectoryPath(fileName: string): string {
    return path.join(uploadsDirectory, getPdfPageDirectoryName(fileName));
}

function getImageAssetDirectoryName(fileName: string): string {
    const fileBaseName = path.basename(fileName, path.extname(fileName));
    return `${fileBaseName}-assets`;
}

function getImageAssetDirectoryPath(fileName: string): string {
    return path.join(uploadsDirectory, getImageAssetDirectoryName(fileName));
}

function getImageContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.png') {
        return 'image/png';
    }
    if (ext === '.jpg' || ext === '.jpeg') {
        return 'image/jpeg';
    }
    return 'application/octet-stream';
}

function chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

async function renderPdfPagesToImages(filePath: string, fileName: string): Promise<PageAsset[]> {
    const pageDirectoryName = getPdfPageDirectoryName(fileName);
    const pageDirectoryPath = getPdfPageDirectoryPath(fileName);
    const pageDirectoryRelativePath = path.join('uploads', pageDirectoryName);

    await mkdir(pageDirectoryPath, { recursive: true });

    try {
        const renderedPages = await pdfToPng(filePath, {
            outputFolder: pageDirectoryRelativePath,
            outputFileMaskFunc: (pageNumber) => `page-${pageNumber}.png`,
            returnPageContent: false,
            viewportScale: 1.5,
            processPagesInParallel: true,
            concurrencyLimit: 2,
        });

        return Promise.all(
            renderedPages.map(async (page: PngPageOutput) => {
                const imagePath = path.join(pageDirectoryPath, page.name);
                const pageBaseName = path.parse(page.name).name;
                const thumbnailName = `${pageBaseName}${THUMBNAIL_SUFFIX}`;
                const thumbnailPath = path.join(pageDirectoryPath, thumbnailName);

                await sharp(imagePath)
                    .rotate()
                    .resize({
                        width: THUMBNAIL_WIDTH,
                        fit: 'inside',
                        withoutEnlargement: true,
                    })
                    .webp({
                        quality: THUMBNAIL_QUALITY,
                    })
                    .toFile(thumbnailPath);

                return {
                    imagePath,
                    imageName: page.name,
                    thumbnailPath,
                    thumbnailName,
                    width: page.width,
                    height: page.height,
                };
            }),
        );
    } catch (error) {
        await rm(pageDirectoryPath, { recursive: true, force: true });
        throw error;
    }
}

async function uploadPagesToR2(
    blueprintId: string,
    pageAssets: PageAsset[],
): Promise<Array<{ imageUrl: string; thumbnailUrl: string; width: number | null; height: number | null }>> {
    const uploadedPages: Array<{
        imageUrl: string;
        thumbnailUrl: string;
        width: number | null;
        height: number | null;
    }> = new Array(pageAssets.length);
    let currentIndex = 0;

    async function worker(): Promise<void> {
        while (true) {
            const index = currentIndex++;
            if (index >= pageAssets.length) {
                return;
            }

            const pageAsset = pageAssets[index];
            const objectKey = blueprintService.buildBlueprintPageImageKey(
                blueprintId,
                pageAsset.imageName,
            );
            const thumbnailKey = blueprintService.buildBlueprintPageThumbnailKey(
                blueprintId,
                pageAsset.thumbnailName,
            );

            const [imageUrl, thumbnailUrl] = await Promise.all([
                blueprintService.uploadFileToR2(objectKey, pageAsset.imagePath, 'image/png'),
                blueprintService.uploadFileToR2(thumbnailKey, pageAsset.thumbnailPath, 'image/webp'),
            ]);

            uploadedPages[index] = {
                imageUrl,
                thumbnailUrl,
                width: pageAsset.width ?? null,
                height: pageAsset.height ?? null,
            };
        }
    }

    const workerCount = Math.min(PAGE_UPLOAD_CONCURRENCY, pageAssets.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return uploadedPages;
}

async function processPdfBlueprintJob(job: ProcessingJob): Promise<void> {
    const pageAssets = await renderPdfPagesToImages(job.filePath, job.fileName);
    const batches = chunkArray(pageAssets, env.BLUEPRINT_PAGE_BATCH_SIZE);

    await blueprintService.setBlueprintProcessingState(job.blueprintId, {
        processingStatus: 'PROCESSING_PAGES',
        processingStep: 'uploading_rendered_pages',
        processingError: null,
        totalPages: pageAssets.length,
        totalBatches: batches.length,
        currentBatch: 0,
    });

    let processedPages = 0;

    for (const [batchIndex, batch] of batches.entries()) {
        const uploaded = await uploadPagesToR2(job.blueprintId, batch);
        await blueprintService.upsertBlueprintPages(
            job.blueprintId,
            uploaded.map((page, index) => ({
                pageNumber: batchIndex * env.BLUEPRINT_PAGE_BATCH_SIZE + index + 1,
                imageUrl: page.imageUrl,
                thumbnailUrl: page.thumbnailUrl,
                width: page.width,
                height: page.height,
                pageStatus: 'READY',
            })),
        );
        processedPages += batch.length;
        await blueprintService.setBlueprintProcessingState(job.blueprintId, {
            pageCount: processedPages,
            processedPages,
            thumbnailsGenerated: processedPages,
            readyPages: processedPages,
            currentBatch: batchIndex + 1,
            processingStatus:
                processedPages < pageAssets.length ? 'PARTIALLY_READY' : 'PROCESSING_AI',
            processingStep:
                processedPages < pageAssets.length ? 'pages_available' : 'extracting_ai_metadata',
        });
    }

    let aiProcessedPages = 0;
    for (let pageNumber = 1; pageNumber <= pageAssets.length; pageNumber += 1) {
        const blueprint = await blueprintService.getBlueprintById(job.blueprintId);
        const page = blueprint?.pages.find((item) => item.pageNumber === pageNumber);
        if (!page?.imageUrl || !page.thumbnailUrl) {
            continue;
        }

        try {
            const aiMetadata = await extractPageDetails({
                blueprintId: job.blueprintId,
                pageNumber,
                imageUrl: page.imageUrl,
                thumbnailUrl: page.thumbnailUrl,
            });
            await blueprintService.updateBlueprintPageAI(
                job.blueprintId,
                pageNumber,
                (aiMetadata as Prisma.InputJsonValue | undefined) ?? undefined,
                aiMetadata ? 'READY' : 'SKIPPED',
            );
        } catch (error) {
            await blueprintService.updateBlueprintPageAI(
                job.blueprintId,
                pageNumber,
                undefined,
                'FAILED',
                error instanceof Error ? error.message : 'AI extraction failed',
            );
        }

        aiProcessedPages += 1;
        await blueprintService.setBlueprintProcessingState(job.blueprintId, {
            aiProcessedPages,
            processingStatus:
                aiProcessedPages < pageAssets.length ? 'PROCESSING_AI' : 'READY',
            processingStep: aiProcessedPages < pageAssets.length ? 'extracting_ai_metadata' : 'completed',
            processedAt: aiProcessedPages === pageAssets.length ? new Date() : undefined,
            processingCompletedAt:
                aiProcessedPages === pageAssets.length ? new Date() : undefined,
            processingError: null,
        });
    }

    if (pageAssets.length === 0) {
        await blueprintService.setBlueprintProcessingState(job.blueprintId, {
            processingStatus: 'FAILED',
            processingStep: 'processing_failed',
            processingError: 'No pages were rendered from the PDF',
        });
    }
}

async function processImageBlueprintJob(job: ProcessingJob): Promise<void> {
    const imageAssetDirectoryPath = getImageAssetDirectoryPath(job.fileName);
    const originalExt = path.extname(job.fileName).toLowerCase() || '.png';
    const imageName = `page-1${originalExt}`;
    const imagePath = path.join(imageAssetDirectoryPath, imageName);
    const thumbnailName = `page-1${THUMBNAIL_SUFFIX}`;
    const thumbnailPath = path.join(imageAssetDirectoryPath, thumbnailName);

    await blueprintService.setBlueprintProcessingState(job.blueprintId, {
        processingStatus: 'PROCESSING_PAGES',
        processingStep: 'processing_single_image',
        processingError: null,
        processedAt: null,
        processingStartedAt: new Date(),
        processingCompletedAt: null,
        totalPages: 1,
        totalBatches: 1,
        currentBatch: 1,
    });

    await mkdir(imageAssetDirectoryPath, { recursive: true });
    await sharp(job.filePath).rotate().toFile(imagePath);
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    await image
        .clone()
        .resize({
            width: THUMBNAIL_WIDTH,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({
            quality: THUMBNAIL_QUALITY,
        })
        .toFile(thumbnailPath);

    const imageKey = blueprintService.buildBlueprintPageImageKey(job.blueprintId, imageName);
    const thumbnailKey = blueprintService.buildBlueprintPageThumbnailKey(job.blueprintId, thumbnailName);
    const [imageUrl, thumbnailUrl] = await Promise.all([
        blueprintService.uploadFileToR2(imageKey, imagePath, getImageContentType(imageName)),
        blueprintService.uploadFileToR2(thumbnailKey, thumbnailPath, 'image/webp'),
    ]);

    await blueprintService.upsertBlueprintPages(job.blueprintId, [
        {
            pageNumber: 1,
            imageUrl,
            thumbnailUrl,
            width: metadata.width ?? null,
            height: metadata.height ?? null,
            pageStatus: 'READY',
        },
    ]);

    let aiMetadata: Record<string, unknown> | null = null;
    try {
        aiMetadata = await extractPageDetails({
            blueprintId: job.blueprintId,
            pageNumber: 1,
            imageUrl,
            thumbnailUrl,
        });
        await blueprintService.updateBlueprintPageAI(
            job.blueprintId,
            1,
            (aiMetadata as Prisma.InputJsonValue | undefined) ?? undefined,
            aiMetadata ? 'READY' : 'SKIPPED',
        );
    } catch (error) {
        await blueprintService.updateBlueprintPageAI(
            job.blueprintId,
            1,
            undefined,
            'FAILED',
            error instanceof Error ? error.message : 'AI extraction failed',
        );
    }

    await blueprintService.setBlueprintProcessingState(job.blueprintId, {
        pageCount: 1,
        processedPages: 1,
        thumbnailsGenerated: 1,
        aiProcessedPages: 1,
        readyPages: 1,
        processingStatus: 'READY',
        processingStep: 'completed',
        processedAt: new Date(),
        processingCompletedAt: new Date(),
        processingError: null,
    });
}

export async function enqueuePdfBlueprintProcessing(job: ProcessingJob): Promise<void> {
    await enqueueBlueprintJob({
        ...job,
        kind: 'pdf',
    });
}

export async function enqueueImageBlueprintProcessing(job: ProcessingJob): Promise<void> {
    await enqueueBlueprintJob({
        ...job,
        kind: 'image',
    });
}

export async function processQueuedBlueprintJob(job: BlueprintQueueMessage): Promise<void> {
    try {
        await blueprintService.setBlueprintProcessingState(job.blueprintId, {
            processingWorkerId: `worker-${process.pid}`,
            processingJobId: job.blueprintId,
            processingStartedAt: new Date(),
            processingError: null,
        });

        if (job.kind === 'pdf') {
            await processPdfBlueprintJob(job);
        } else {
            await processImageBlueprintJob(job);
        }
    } catch (error) {
        await blueprintService.updateBlueprint(job.blueprintId, {
            processingStatus: 'FAILED',
            processingStep: 'processing_failed',
            processingError: error instanceof Error ? error.message : 'Unknown processing error',
            processingCompletedAt: null,
        });
        throw error;
    } finally {
        await rm(getPdfPageDirectoryPath(job.fileName), { recursive: true, force: true }).catch(() => {});
        await rm(getImageAssetDirectoryPath(job.fileName), { recursive: true, force: true }).catch(() => {});
        if (job.cleanupSourceFile) {
            await rm(job.filePath, { force: true }).catch(() => {});
        }
    }
}

export async function pollBlueprintQueueOnce(): Promise<number> {
    const messages = await receiveBlueprintJobs();
    let processed = 0;

    for (const message of messages) {
        if (!(message.Body && message.ReceiptHandle)) {
            continue;
        }

        const job = JSON.parse(message.Body) as BlueprintQueueMessage;
        await processQueuedBlueprintJob(job);
        await deleteBlueprintJob(message.ReceiptHandle);
        processed += 1;
    }

    return processed;
}
