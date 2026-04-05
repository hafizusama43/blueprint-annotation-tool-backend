import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export async function logAdminAction(input: {
    actorUserId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: unknown;
}) {
    return prisma.adminAuditLog.create({
        data: {
            actorUserId: input.actorUserId ?? null,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId ?? null,
            metadata:
                input.metadata && typeof input.metadata === 'object'
                    ? (input.metadata as Prisma.InputJsonValue)
                    : undefined,
        },
    });
}
