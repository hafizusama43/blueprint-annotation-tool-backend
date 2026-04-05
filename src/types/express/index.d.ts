import type { UserRole } from '@prisma/client';

declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId: string;
                sessionId: string;
                organizationId?: string;
                role?: UserRole;
            };
        }
    }
}

export {};
import 'express';

declare module 'express' {
    export interface Request {
        requestId?: string;
    }
}
