import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';

export interface AppError extends Error {
    statusCode?: number;
    details?: unknown;
}

const isPrismaError = (maybeErr: unknown): maybeErr is Prisma.PrismaClientKnownRequestError =>
    maybeErr instanceof Prisma.PrismaClientKnownRequestError;

export function errorHandler(
    err: AppError | ZodError | Error,
    req: Request,
    res: Response,
    _next: NextFunction,
): void {
    const requestId = (req as any).requestId || '-';
    // Zod validation errors
    if (err instanceof ZodError) {
        res.status(400).json({
            message: 'Validation error',
            details: err.errors,
            requestId,
        });
        return;
    }

    if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
                message: 'Uploaded file is too large. Max size is 350 MB.',
                requestId,
            });
            return;
        }

        res.status(400).json({
            message: err.message,
            requestId,
        });
        return;
    }

    if (isPrismaError(err)) {
        if (err.code === 'P2002') {
            res.status(409).json({
                message: 'Duplicate entry',
                details: err.meta,
                requestId,
            });
            return;
        }
        if (err.code === 'P2025') {
            res.status(404).json({
                message: 'Record not found',
                requestId,
            });
            return;
        }
    }

    // Custom app errors
    if ('statusCode' in err && err.statusCode) {
        const statusCode = Number(err.statusCode);
        const appErr = err as AppError;
        // Handle idempotency key conflict
        if (statusCode === 409 && err.message.includes('Idempotency key')) {
            res.status(409).json({
                message: 'Idempotency key reused with different request body',
                details: appErr.details,
                requestId,
            });
            return;
        }
        res.status(statusCode).json({
            message: err.message,
            details: appErr.details,
            requestId,
        });
        return;
    }

    // Default error
    console.error(`[${requestId}] Unhandled error:`, err);
    res.status(500).json({
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        requestId,
    });
}

export function createError(
    message: string,
    statusCode: number = 500,
    details?: unknown,
): AppError {
    const error = new Error(message) as AppError;
    error.statusCode = statusCode;
    error.details = details;
    return error;
}
