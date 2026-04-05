import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as organizationController from './organization.controller';

const router = Router();

router.get('/', requireAuth, organizationController.getOrganizations);
router.get('/:id', requireAuth, organizationController.getOrganizationById);
router.post('/', requireAuth, organizationController.createOrganization);
router.patch('/:id', requireAuth, organizationController.updateOrganization);
router.patch('/:id/status', requireAuth, organizationController.updateOrganizationStatus);
router.post('/:id/members', requireAuth, organizationController.addOrganizationMember);
router.delete('/:id/members/:userId', requireAuth, organizationController.removeOrganizationMember);

export default router;
