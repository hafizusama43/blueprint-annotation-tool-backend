import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { pdfToPng, type PngPageOutput } from 'pdf-to-png-converter';
import sharp from 'sharp';
import { uploadsDirectory } from '../../middleware/upload.middleware';
import * as blueprintService from './blueprint.service';

type ProcessingJob = {
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

async function renderPdfPagesToImages(filePath: string, fileName: string): Promise<PageAsset[]> {
    const pageDirectoryName = getPdfPageDirectoryName(fileName);
    const pageDirectoryPath = getPdfPageDirectoryPath(fileName);
    const pageDirectoryRelativePath = path.join('uploads', pageDirectoryName);

    await mkdir(pageDirectoryPath, { recursive: true });

    try {
        const renderedPages = await pdfToPng(filePath, {
            // pdf-to-png-converter resolves outputFolder from cwd; use relative path.
            outputFolder: pageDirectoryRelativePath,
            outputFileMaskFunc: (pageNumber) => `page-${pageNumber}.png`,
            returnPageContent: false,
            viewportScale: 1.5,
            processPagesInParallel: true,
            concurrencyLimit: 2,
        });

        const pageAssets = await Promise.all(
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

        return pageAssets;
    } catch (error) {
        await rm(pageDirectoryPath, { recursive: true, force: true });
        throw error;
    }
}

function buildBlueprintPages(
    pages: Array<{
        imageUrl: string;
        thumbnailUrl: string;
        width?: number | null;
        height?: number | null;
    }>,
): Prisma.BlueprintPageCreateManyBlueprintInput[] {
    return pages.map((page, index) => ({
        pageNumber: index + 1,
        imageUrl: page.imageUrl,
        thumbnailUrl: page.thumbnailUrl,
        width: page.width ?? null,
        height: page.height ?? null,
    }));
}

async function uploadPagesToR2InBatches(
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

export function enqueuePdfBlueprintProcessing(job: ProcessingJob): void {
    setImmediate(async () => {
        try {
            await blueprintService.updateBlueprint(job.blueprintId, {
                processingStatus: 'PROCESSING',
                processingError: null,
                processedAt: null,
            });

            const pageAssets = await renderPdfPagesToImages(job.filePath, job.fileName);
            const uploadedPages = await uploadPagesToR2InBatches(job.blueprintId, pageAssets);

            await blueprintService.replaceBlueprintPagesAndMarkReady(
                job.blueprintId,
                buildBlueprintPages(uploadedPages),
            );
        } catch (error) {
            console.error('Error processing PDF', error);
            await rm(getPdfPageDirectoryPath(job.fileName), { recursive: true, force: true });

            const message = error instanceof Error ? error.message : 'Unknown PDF processing error';
            try {
                await blueprintService.updateBlueprint(job.blueprintId, {
                    pageCount: 0,
                    processingStatus: 'FAILED',
                    processingError: message,
                    processedAt: null,
                });
            } catch (updateError) {
                console.error('Failed to update blueprint processing status', updateError);
            }
        } finally {
            await rm(getPdfPageDirectoryPath(job.fileName), { recursive: true, force: true });
            if (job.cleanupSourceFile) {
                await rm(job.filePath, { force: true });
            }
        }
    });
}

export async function enqueueImageBlueprintProcessing(job: ProcessingJob): Promise<void> {
    const imageAssetDirectoryPath = getImageAssetDirectoryPath(job.fileName);
    const originalExt = path.extname(job.fileName).toLowerCase() || '.png';
    const imageName = `page-1${originalExt}`;
    const imagePath = path.join(imageAssetDirectoryPath, imageName);
    const thumbnailName = `page-1${THUMBNAIL_SUFFIX}`;
    const thumbnailPath = path.join(imageAssetDirectoryPath, thumbnailName);

    try {
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
        const thumbnailKey = blueprintService.buildBlueprintPageThumbnailKey(
            job.blueprintId,
            thumbnailName,
        );
        const [imageUrl, thumbnailUrl] = await Promise.all([
            blueprintService.uploadFileToR2(imageKey, imagePath, getImageContentType(imageName)),
            blueprintService.uploadFileToR2(thumbnailKey, thumbnailPath, 'image/webp'),
        ]);

        await blueprintService.replaceBlueprintPagesAndMarkReady(job.blueprintId, [
            {
                pageNumber: 1,
                imageUrl,
                thumbnailUrl,
                width: metadata.width ?? null,
                height: metadata.height ?? null,
            },
        ]);
    } catch (error) {
        console.error('Error processing image', error);
        const message = error instanceof Error ? error.message : 'Unknown image processing error';
        try {
            await blueprintService.updateBlueprint(job.blueprintId, {
                pageCount: 0,
                processingStatus: 'FAILED',
                processingError: message,
                processedAt: null,
            });
        } catch (updateError) {
            console.error('Failed to update image processing status', updateError);
        }
    } finally {
        await rm(imageAssetDirectoryPath, { recursive: true, force: true });
        if (job.cleanupSourceFile) {
            await rm(job.filePath, { force: true });
        }
    }
}
