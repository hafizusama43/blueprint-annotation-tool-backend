import { NextFunction, Request, Response } from 'express';
import {
    BillingInterval,
    BillingProvider,
    PaymentStatus,
    SubscriptionStatus,
} from '@prisma/client';
import { z } from 'zod';
import * as subscriptionService from './subscription.service';

const planSchema = z.object({
    code: z.string().min(2),
    name: z.string().min(2),
    description: z.string().optional(),
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
        const payload = planSchema.parse(req.body);
        const plan = await subscriptionService.createPlan(payload);
        res.status(201).json(plan);
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
        const payments = await subscriptionService.getPayments(req.params.organizationId);
        res.json(payments);
    } catch (error) {
        next(error);
    }
}

export async function createPayment(req: Request, res: Response, next: NextFunction) {
    try {
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
