import { NextFunction, Request, Response } from 'express';
import {
    BillingInterval,
    BillingProvider,
    PaymentStatus,
    SubscriptionStatus,
    UserRole,
} from '@prisma/client';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
import { assertOrganizationRole, isSuperAdmin } from '../../services/permissions/permissions.service';
import * as subscriptionService from './subscription.service';

const planSchema = z.object({
    code: z.string().min(2),
    name: z.string().min(2),
    description: z.string().optional(),
    providerPlanId: z.string().optional(),
    billingInterval: z.nativeEnum(BillingInterval),
    amountInCents: z.number().int().nonnegative(),
    currency: z.string().length(3).optional(),
    maxUsers: z.number().int().positive().optional(),
    maxProjects: z.number().int().positive().optional(),
    maxStorageGb: z.number().int().positive().optional(),
    features: z.record(z.any()).optional(),
});

const subscriptionSchema = z.object({
    planId: z.string().cuid(),
    provider: z.nativeEnum(BillingProvider).optional(),
    providerCustomerId: z.string().optional(),
    providerSubscriptionId: z.string().optional(),
    status: z.nativeEnum(SubscriptionStatus).optional(),
    currentPeriodStart: z.coerce.date().optional(),
    currentPeriodEnd: z.coerce.date().optional(),
    trialEndsAt: z.coerce.date().optional(),
    metadata: z.record(z.any()).optional(),
});

const paymentSchema = z.object({
    organizationSubscriptionId: z.string().cuid().optional(),
    provider: z.nativeEnum(BillingProvider).optional(),
    providerPaymentId: z.string().optional(),
    providerInvoiceId: z.string().optional(),
    amountInCents: z.number().int().nonnegative(),
    currency: z.string().length(3).optional(),
    status: z.nativeEnum(PaymentStatus).optional(),
    dueAt: z.coerce.date().optional(),
    paidAt: z.coerce.date().optional(),
    metadata: z.record(z.any()).optional(),
});

const checkoutSchema = z.object({
    planId: z.string().cuid(),
});

export async function getPlans(_req: Request, res: Response, next: NextFunction) {
    try {
        const plans = await subscriptionService.getPlans();
        res.json(plans);
    } catch (error) {
        next(error);
    }
}

export async function createPlan(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        if (!(await isSuperAdmin(req.auth.userId))) {
            return next(createError('Super admin access required', 403));
        }
        const payload = planSchema.parse(req.body);
        const plan = await subscriptionService.createPlan(payload);
        res.status(201).json(plan);
    } catch (error) {
        next(error);
    }
}

export async function createCheckoutSession(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.organizationId, [UserRole.ADMIN]);
        const payload = checkoutSchema.parse(req.body);
        const session = await subscriptionService.createStripeCheckoutSession({
            organizationId: req.params.organizationId,
            planId: payload.planId,
        });
        res.status(201).json(session);
    } catch (error) {
        next(error);
    }
}

export async function getOrganizationSubscriptions(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.organizationId, [UserRole.ADMIN, UserRole.CLIENT]);
        const subscriptions = await subscriptionService.getOrganizationSubscriptions(
            req.params.organizationId,
        );
        res.json(subscriptions);
    } catch (error) {
        next(error);
    }
}

export async function createOrganizationSubscription(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.organizationId, [UserRole.ADMIN]);
        const payload = subscriptionSchema.parse(req.body);
        const subscription = await subscriptionService.createOrganizationSubscription({
            organizationId: req.params.organizationId,
            ...payload,
        });
        res.status(201).json(subscription);
    } catch (error) {
        next(error);
    }
}

export async function getPayments(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.organizationId, [UserRole.ADMIN, UserRole.CLIENT]);
        const payments = await subscriptionService.getPayments(req.params.organizationId);
        res.json(payments);
    } catch (error) {
        next(error);
    }
}

export async function createPayment(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.organizationId, [UserRole.ADMIN]);
        const payload = paymentSchema.parse(req.body);
        const payment = await subscriptionService.createPayment({
            organizationId: req.params.organizationId,
            ...payload,
        });
        res.status(201).json(payment);
    } catch (error) {
        next(error);
    }
}

export async function stripeWebhook(req: Request, res: Response, next: NextFunction) {
    try {
        await subscriptionService.handleStripeWebhook(req.body as { type: string; data: { object: Record<string, unknown> } });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
