import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as teamController from './team.controller';

const router = Router();

router.get('/', requireAuth, teamController.getTeams);
router.get('/:id', requireAuth, teamController.getTeamById);
router.post('/', requireAuth, teamController.createTeam);
router.post('/:id/members', requireAuth, teamController.addTeamMember);

export default router;
