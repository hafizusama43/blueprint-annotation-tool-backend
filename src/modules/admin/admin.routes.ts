import { Router } from 'express';
import { AppGlobalRole } from '@prisma/client';
import { requireAuth, requireGlobalRole } from '../../middleware/auth.middleware';
import * as adminController from './admin.controller';

const router = Router();

router.use(requireAuth, requireGlobalRole(AppGlobalRole.SUPER_ADMIN));

router.get('/dashboard', adminController.getDashboard);
router.get('/system-health', adminController.getSystemHealth);
router.post('/system-health/:service/ping', adminController.pingSystemService);
router.get('/users', adminController.listUsers);
router.patch('/users/:userId/global-role', adminController.updateUserGlobalRole);
router.get('/organizations', adminController.listOrganizations);
router.patch('/organizations/:organizationId/status', adminController.updateOrganizationStatus);
router.get('/teams', adminController.listTeams);
router.patch('/teams/:teamId/status', adminController.updateTeamStatus);
router.get('/projects', adminController.listProjects);
router.get('/subscriptions', adminController.listSubscriptions);
router.get('/payments', adminController.listPayments);
router.get('/blueprints', adminController.listBlueprints);
router.get('/audit-logs', adminController.getAuditLogs);

export default router;
