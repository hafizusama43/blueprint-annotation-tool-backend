import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { BlueprintPage, Prisma } from '@prisma/client';
import { pdfToPng, type PngPageOutput } from 'pdf-to-png-converter';
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
    width?: number | null;
    height?: number | null;
};

function getPdfPageDirectoryName(fileName: string): string {
    const fileBaseName = path.basename(fileName, path.extname(fileName));
    return `${fileBaseName}-pages`;
}

function getPdfPageDirectoryPath(fileName: string): string {
    return path.join(uploadsDirectory, getPdfPageDirectoryName(fileName));
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

        return renderedPages.map((page: PngPageOutput) => ({
            imagePath: path.join(pageDirectoryPath, page.name),
            imageName: page.name,
            width: page.width,
            height: page.height,
        }));
    } catch (error) {
        await rm(pageDirectoryPath, { recursive: true, force: true });
        throw error;
    }
}

function buildBlueprintPages(
    pages: Array<{
        imageUrl: string;
        width?: number | null;
        height?: number | null;
    }>,
): Prisma.BlueprintPageCreateManyBlueprintInput[] {
    return pages.map((page, index) => ({
        pageNumber: index + 1,
        imageUrl: page.imageUrl,
        width: page.width ?? null,
        height: page.height ?? null,
    }));
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

            const uploadedPages = await Promise.all(
                pageAssets.map(async (pageAsset) => {
                    const objectKey = blueprintService.buildBlueprintPageImageKey(
                        job.blueprintId,
                        pageAsset.imageName,
                    );

                    const imageUrl = await blueprintService.uploadFileToR2(
                        objectKey,
                        pageAsset.imagePath,
                        'image/png',
                    );

                    return {
                        imageUrl,
                        width: pageAsset.width ?? null,
                        height: pageAsset.height ?? null,
                    };
                }),
            );

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
