import type {
    Notification,
    NotificationChannel,
    NotificationDelivery,
    NotificationType,
    Prisma,
    PrismaClient,
} from '@prisma/client';
import { NotificationDeliveryStatus, NotificationStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';

type DbClient = PrismaClient | Prisma.TransactionClient;

type CreateNotificationInput = {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
};

type CreateNotificationDeliveryInput = {
    notificationId: string;
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    provider?: string | null;
    metadata?: Prisma.InputJsonValue;
};

type UpdateNotificationDeliveryInput = {
    provider?: string | null;
    externalMessageId?: string | null;
    errorMessage?: string | null;
    metadata?: Prisma.InputJsonValue;
};

function getDbClient(client?: DbClient): DbClient {
    return client ?? prisma;
}

export async function createNotification(
    input: CreateNotificationInput,
    client?: DbClient,
): Promise<Notification> {
    return getDbClient(client).notification.create({
        data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            message: input.message,
            status: NotificationStatus.UNREAD,
            metadata: input.metadata,
        },
    });
}

export async function createNotificationDelivery(
    input: CreateNotificationDeliveryInput,
    client?: DbClient,
): Promise<NotificationDelivery> {
    return getDbClient(client).notificationDelivery.create({
        data: {
            notificationId: input.notificationId,
            channel: input.channel,
            status: NotificationDeliveryStatus.PENDING,
            recipient: input.recipient,
            subject: input.subject ?? null,
            provider: input.provider ?? null,
            metadata: input.metadata,
        },
    });
}

export async function markNotificationDeliverySent(
    deliveryId: string,
    input: UpdateNotificationDeliveryInput = {},
    client?: DbClient,
): Promise<NotificationDelivery> {
    const now = new Date();
    return getDbClient(client).notificationDelivery.update({
        where: { id: deliveryId },
        data: {
            status: NotificationDeliveryStatus.SENT,
            provider: input.provider ?? undefined,
            externalMessageId: input.externalMessageId ?? null,
            errorMessage: null,
            attemptedAt: now,
            deliveredAt: now,
            metadata: input.metadata,
        },
    });
}

export async function markNotificationDeliveryFailed(
    deliveryId: string,
    input: UpdateNotificationDeliveryInput = {},
    client?: DbClient,
): Promise<NotificationDelivery> {
    return getDbClient(client).notificationDelivery.update({
        where: { id: deliveryId },
        data: {
            status: NotificationDeliveryStatus.FAILED,
            provider: input.provider ?? undefined,
            externalMessageId: input.externalMessageId ?? null,
            errorMessage: input.errorMessage ?? null,
            attemptedAt: new Date(),
            metadata: input.metadata,
        },
    });
}
