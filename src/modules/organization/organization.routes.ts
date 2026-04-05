import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as organizationController from './organization.controller';

const router = Router();

router.get('/', requireAuth, organizationController.getOrganizations);
router.get('/:id', requireAuth, organizationController.getOrganizationById);
router.post('/', requireAuth, organizationController.createOrganization);
router.post('/:id/members', requireAuth, organizationController.addOrganizationMember);

export default router;
