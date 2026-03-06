import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

const r2Endpoint = `https://${env.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

export const r2Client = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    credentials: {
        accessKeyId: env.CF_R2_ACCESS_KEY,
        secretAccessKey: env.CF_R2_SECRET_KEY,
    },
});

export const R2_BUCKET = env.CF_R2_BUCKET;
export const R2_PUBLIC_BASE_URL = env.CF_R2_PUBLIC_BASE_URL ?? null;
