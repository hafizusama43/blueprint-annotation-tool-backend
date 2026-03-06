import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
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
});

export const env = envSchema.parse(process.env);
