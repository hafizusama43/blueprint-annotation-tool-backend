import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from './env';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    prismaPool: Pool | undefined;
};

const prismaPool =
    globalForPrisma.prismaPool ??
    new Pool({
        connectionString: env.DATABASE_URL,
    });

const prismaAdapter = new PrismaPg(prismaPool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter: prismaAdapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaPool = prismaPool;
    globalForPrisma.prisma = prisma;
}
