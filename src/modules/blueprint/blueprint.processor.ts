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
    imageUrl: string | null;
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

    await mkdir(pageDirectoryPath, { recursive: true });

    try {
        const renderedPages = await pdfToPng(filePath, {
            outputFolder: pageDirectoryPath,
            outputFileMaskFunc: (pageNumber) => `page-${pageNumber}.png`,
            returnPageContent: false,
            viewportScale: 1.5,
            processPagesInParallel: true,
            concurrencyLimit: 2,
        });

        return renderedPages.map((page: PngPageOutput) => ({
            imageUrl: `/uploads/${pageDirectoryName}/${page.name}`,
            width: page.width,
            height: page.height,
        }));
    } catch (error) {
        await rm(pageDirectoryPath, { recursive: true, force: true });
        throw error;
    }
}

function buildBlueprintPages(pages: PageAsset[]): Prisma.BlueprintPageCreateManyBlueprintInput[] {
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
            const pageAssets = await renderPdfPagesToImages(job.filePath, job.fileName);
            await blueprintService.replaceBlueprintPagesAndMarkReady(
                job.blueprintId,
                buildBlueprintPages(pageAssets),
            );
        } catch (error) {
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
            if (job.cleanupSourceFile) {
                await rm(job.filePath, { force: true });
            }
        }
    });
}
