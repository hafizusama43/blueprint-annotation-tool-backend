import { z } from 'zod';

export const blueprintSchema = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    fileUrl: z.string().min(2),
    projectId: z.string().cuid().optional(),
    uploadedByUserId: z.string().cuid().optional(),
    pageCount: z.number().int().positive().optional(),
    metadata: z.record(z.any()).optional(),
});

export const uploadBlueprintSchema = z.object({
    key: z.string().min(1),
    originalFileName: z.string().min(1),
    fileUrl: z.string().url().optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    projectId: z.string().cuid().optional(),
    uploadedByUserId: z.string().cuid().optional(),
    metadata: z.string().optional(),
});

export const presignedUploadRequestSchema = z.object({
    fileName: z.string().min(1, 'fileName is required'),
    contentType: z.string().min(1).optional(),
});

export type PresignedUploadRequest = z.infer<typeof presignedUploadRequestSchema>;
export type UploadBlueprintRequest = z.infer<typeof uploadBlueprintSchema>;
