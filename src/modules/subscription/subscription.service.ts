import type {
    BillingInterval,
    BillingProvider,
    PaymentStatus,
    Prisma,
    SubscriptionStatus,
} from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { getStripeClient } from '../../services/billing/stripe';
import { deleteKeys } from '../../services/cache/cache.service';
import { cacheKeys } from '../../services/cache/keys';

export type SubscriptionPlanPayload = {
    code: string;
    name: string;
    description?: string;
    providerPlanId?: string;
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
            providerPlanId: data.providerPlanId ?? null,
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
    const subscription = await prisma.organizationSubscription.create({
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
    await deleteKeys(cacheKeys.subscriptionOrg(data.organizationId));
    return subscription;
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
    const payment = await prisma.payment.create({
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
    await deleteKeys(cacheKeys.subscriptionOrg(data.organizationId));
    return payment;
}

export async function createStripeCheckoutSession(input: {
    organizationId: string;
    planId: string;
}) {
    const stripe = getStripeClient();
    const plan = await prisma.subscriptionPlan.findUnique({
        where: {
            id: input.planId,
        },
    });

    if (!plan?.providerPlanId) {
        throw new Error('The selected plan does not have a Stripe price id configured');
    }

    const organization = await prisma.organization.findUnique({
        where: {
            id: input.organizationId,
        },
    });

    if (!organization) {
        throw new Error('Organization not found');
    }

    const customer = await stripe.customers.create({
        name: organization.name,
        email: organization.billingEmail ?? undefined,
        metadata: {
            organizationId: organization.id,
        },
    });

    await prisma.organizationSubscription.create({
        data: {
            organizationId: organization.id,
            planId: plan.id,
            provider: 'STRIPE',
            providerCustomerId: customer.id,
            status: 'INCOMPLETE',
            metadata: {
                checkoutStarted: true,
            },
        },
    });

    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.id,
        line_items: [
            {
                price: plan.providerPlanId,
                quantity: 1,
            },
        ],
        success_url: env.STRIPE_SUCCESS_URL ?? `${env.FRONTEND_URL}/billing/success`,
        cancel_url: env.STRIPE_CANCEL_URL ?? `${env.FRONTEND_URL}/billing/cancel`,
        metadata: {
            organizationId: organization.id,
            planId: plan.id,
        },
    });

    return {
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
    };
}

export async function handleStripeWebhook(event: {
    type: string;
    data: {
        object: Record<string, unknown>;
    };
}) {
    const object = event.data.object;
    const metadata =
        object.metadata && typeof object.metadata === 'object'
            ? (object.metadata as Record<string, unknown>)
            : {};

    if (event.type === 'checkout.session.completed') {
        const organizationId =
            typeof metadata.organizationId === 'string' ? metadata.organizationId : null;
        const planId = typeof metadata.planId === 'string' ? metadata.planId : null;
        const subscriptionId =
            typeof object.subscription === 'string' ? object.subscription : null;
        const customerId = typeof object.customer === 'string' ? object.customer : null;

        if (organizationId && planId) {
            await prisma.organizationSubscription.updateMany({
                where: {
                    organizationId,
                    planId,
                    provider: 'STRIPE',
                    providerSubscriptionId: null,
                },
                data: {
                    providerCustomerId: customerId,
                    providerSubscriptionId: subscriptionId,
                    status: 'ACTIVE',
                    currentPeriodStart: new Date(),
                },
            });
            await deleteKeys(cacheKeys.subscriptionOrg(organizationId));
        }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
        const subscriptionId = typeof object.id === 'string' ? object.id : null;
        const customerId = typeof object.customer === 'string' ? object.customer : null;
        const status = typeof object.status === 'string' ? object.status.toUpperCase() : 'ACTIVE';
        const organizationId =
            typeof metadata.organizationId === 'string' ? metadata.organizationId : null;

        if (subscriptionId && organizationId) {
            await prisma.organizationSubscription.updateMany({
                where: {
                    organizationId,
                    provider: 'STRIPE',
                    OR: [
                        { providerSubscriptionId: subscriptionId },
                        { providerCustomerId: customerId ?? undefined },
                    ],
                },
                data: {
                    providerCustomerId: customerId,
                    providerSubscriptionId: subscriptionId,
                    status:
                        status === 'PAST_DUE'
                            ? 'PAST_DUE'
                            : status === 'CANCELED'
                              ? 'CANCELED'
                              : status === 'INCOMPLETE'
                                ? 'INCOMPLETE'
                                : 'ACTIVE',
                },
            });
            await deleteKeys(cacheKeys.subscriptionOrg(organizationId));
        }
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
        const invoiceLines = object.lines as
            | {
                  data?: Array<{
                      metadata?: Record<string, unknown>;
                  }>;
              }
            | undefined;
        const organizationId =
            typeof invoiceLines?.data?.[0]?.metadata?.organizationId === 'string'
                ? (invoiceLines.data?.[0]?.metadata?.organizationId as string)
                : null;
        const providerSubscriptionId =
            typeof object.subscription === 'string' ? object.subscription : null;

        if (organizationId) {
            await prisma.payment.create({
                data: {
                    organization: {
                        connect: {
                            id: organizationId,
                        },
                    },
                    provider: 'STRIPE',
                    providerPaymentId: typeof object.payment_intent === 'string' ? object.payment_intent : null,
                    providerInvoiceId: typeof object.id === 'string' ? object.id : null,
                    organizationSubscription: providerSubscriptionId
                        ? {
                              connect: {
                                  providerSubscriptionId,
                              },
                          }
                        : undefined,
                    amountInCents:
                        typeof object.amount_paid === 'number'
                            ? object.amount_paid
                            : typeof object.amount_due === 'number'
                              ? object.amount_due
                              : 0,
                    currency:
                        typeof object.currency === 'string' ? object.currency.toUpperCase() : 'USD',
                    status: event.type === 'invoice.paid' ? 'SUCCEEDED' : 'FAILED',
                    paidAt: event.type === 'invoice.paid' ? new Date() : null,
                    failedAt: event.type === 'invoice.payment_failed' ? new Date() : null,
                },
            });
            await deleteKeys(cacheKeys.subscriptionOrg(organizationId));
        }
    }
}
