import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as subscriptionController from './subscription.controller';

const router = Router();

router.get('/plans', requireAuth, subscriptionController.getPlans);
router.post('/plans', requireAuth, subscriptionController.createPlan);
router.post(
    '/organizations/:organizationId/checkout',
    requireAuth,
    subscriptionController.createCheckoutSession,
);
router.get(
    '/organizations/:organizationId/subscriptions',
    requireAuth,
    subscriptionController.getOrganizationSubscriptions,
);
router.post(
    '/organizations/:organizationId/subscriptions',
    requireAuth,
    subscriptionController.createOrganizationSubscription,
);
router.get(
    '/organizations/:organizationId/payments',
    requireAuth,
    subscriptionController.getPayments,
);
router.post(
    '/organizations/:organizationId/payments',
    requireAuth,
    subscriptionController.createPayment,
);
router.post('/stripe/webhook', subscriptionController.stripeWebhook);

export default router;
