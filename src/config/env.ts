import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    PORT: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    FRONTEND_URL: z.string().url().default('https://www.rohanonlinegrocery.com'),
    CORS_ORIGIN: z.string().optional(),
    APP_VERSION: z.string().default('1.0.0'),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_MINUTES: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(15),
    JWT_REFRESH_TTL_DAYS: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(30),
    JWT_EMAIL_VERIFICATION_TTL_HOURS: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(24),
    JWT_PASSWORD_RESET_TTL_MINUTES: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(30),
    AUTH_MAX_FAILED_ATTEMPTS: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(5),
    AUTH_LOCK_MINUTES: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(15),
    PASSWORD_SCRYPT_COST: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(16384),
    APP_BASE_URL: z.string().url().default('http://localhost:8000'),
    DEFAULT_PERSONAL_PROJECT_NAME: z.string().default('My Project'),
    DEFAULT_ORGANIZATION_PROJECT_NAME: z.string().default('Getting Started'),
    REDIS_URL: z.string().url().optional(),
    REDIS_DEFAULT_TTL_SECONDS: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(300),
    AWS_REGION: z.string().default('us-east-1'),
    SQS_BLUEPRINT_QUEUE_URL: z.string().url().optional(),
    SQS_BLUEPRINT_QUEUE_BATCH_SIZE: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(1),
    WORKER_POLL_INTERVAL_MS: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(5000),
    BLUEPRINT_PAGE_BATCH_SIZE: z
        .union([
            z.string().transform(Number).pipe(z.number().int().positive()),
            z.number().int().positive(),
        ])
        .default(10),
    AI_SERVICE_URL: z.string().url().optional(),
    AI_SERVICE_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_SUCCESS_URL: z.string().url().optional(),
    STRIPE_CANCEL_URL: z.string().url().optional(),
    CF_R2_ACCESS_KEY: z.string().min(1),
    CF_R2_SECRET_KEY: z.string().min(1),
    CF_R2_ACCOUNT_ID: z.string().min(1),
    CF_R2_BUCKET: z.string().min(1),
    CF_R2_PUBLIC_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function validateEnv(): Env {
    if (cachedEnv) {
        return cachedEnv;
    }

    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const formattedIssues = result.error.issues
            .map((issue) => {
                const path = issue.path.join('.') || 'root';
                return `- ${path}: ${issue.message}`;
            })
            .join('\n');

        throw new Error(`Invalid environment variables:\n${formattedIssues}`);
    }

    console.log('🔑 Environment variables validated successfully');
    cachedEnv = result.data;
    return cachedEnv;
}

export const env = validateEnv();
