import type { BillingInterval, BillingProvider, PaymentStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type SubscriptionPlanPayload = {
    code: string;
    name: string;
    description?: string;
    billingInterval: BillingInterval;
    amountInCents: number;
    currency?: string;
    maxUsers?: number;
    maxProjects?: number;
    maxStorageGb?: number;
    features?: Prisma.InputJsonValue;
};

export type OrganizationSubscriptionPayload = {
    organizationId: string;
    planId: string;
    provider?: BillingProvider;
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    status?: SubscriptionStatus;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    trialEndsAt?: Date;
    metadata?: Prisma.InputJsonValue;
};

export type PaymentPayload = {
    organizationId: string;
    organizationSubscriptionId?: string;
    provider?: BillingProvider;
    providerPaymentId?: string;
    providerInvoiceId?: string;
    amountInCents: number;
    currency?: string;
    status?: PaymentStatus;
    dueAt?: Date;
    paidAt?: Date;
    metadata?: Prisma.InputJsonValue;
};

export async function getPlans() {
    return prisma.subscriptionPlan.findMany({
        orderBy: {
            amountInCents: 'asc',
        },
    });
}

export async function createPlan(data: SubscriptionPlanPayload) {
    return prisma.subscriptionPlan.create({
        data: {
            code: data.code,
            name: data.name,
            description: data.description ?? null,
            billingInterval: data.billingInterval,
            amountInCents: data.amountInCents,
            currency: data.currency ?? 'USD',
            maxUsers: data.maxUsers ?? null,
            maxProjects: data.maxProjects ?? null,
            maxStorageGb: data.maxStorageGb ?? null,
            features: data.features ?? undefined,
        },
    });
}

export async function getOrganizationSubscriptions(organizationId: string) {
    return prisma.organizationSubscription.findMany({
        where: {
            organizationId,
        },
        include: {
            plan: true,
            payments: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function createOrganizationSubscription(data: OrganizationSubscriptionPayload) {
    return prisma.organizationSubscription.create({
        data: {
            organization: {
                connect: {
                    id: data.organizationId,
                },
            },
            plan: {
                connect: {
                    id: data.planId,
                },
            },
            provider: data.provider ?? 'GENERIC',
            providerCustomerId: data.providerCustomerId ?? null,
            providerSubscriptionId: data.providerSubscriptionId ?? null,
            status: data.status ?? 'TRIALING',
            currentPeriodStart: data.currentPeriodStart ?? null,
            currentPeriodEnd: data.currentPeriodEnd ?? null,
            trialEndsAt: data.trialEndsAt ?? null,
            metadata: data.metadata ?? undefined,
        },
        include: {
            plan: true,
            organization: true,
        },
    });
}

export async function getPayments(organizationId: string) {
    return prisma.payment.findMany({
        where: {
            organizationId,
        },
        include: {
            organizationSubscription: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function createPayment(data: PaymentPayload) {
    return prisma.payment.create({
        data: {
            organization: {
                connect: {
                    id: data.organizationId,
                },
            },
            ...(data.organizationSubscriptionId
                ? {
                      organizationSubscription: {
                          connect: {
                              id: data.organizationSubscriptionId,
                          },
                      },
                  }
                : {}),
            provider: data.provider ?? 'GENERIC',
            providerPaymentId: data.providerPaymentId ?? null,
            providerInvoiceId: data.providerInvoiceId ?? null,
            amountInCents: data.amountInCents,
            currency: data.currency ?? 'USD',
            status: data.status ?? 'PENDING',
            dueAt: data.dueAt ?? null,
            paidAt: data.paidAt ?? null,
            metadata: data.metadata ?? undefined,
        },
        include: {
            organizationSubscription: true,
            organization: true,
        },
    });
}
