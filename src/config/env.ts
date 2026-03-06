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
