import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';
import * as subscriptionController from './subscription.controller';

const router = Router();

router.get('/plans', requireAuth, subscriptionController.getPlans);
router.post('/plans', requireAuth, requireRole(UserRole.ADMIN), subscriptionController.createPlan);
router.get(
    '/organizations/:organizationId/subscriptions',
    requireAuth,
    subscriptionController.getOrganizationSubscriptions,
);
router.post(
    '/organizations/:organizationId/subscriptions',
    requireAuth,
    requireRole(UserRole.ADMIN),
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
    requireRole(UserRole.ADMIN),
    subscriptionController.createPayment,
);

export default router;
