import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as teamController from './team.controller';

const router = Router();

router.get('/', requireAuth, teamController.getTeams);
router.get('/:id', requireAuth, teamController.getTeamById);
router.post('/', requireAuth, teamController.createTeam);
router.patch('/:id', requireAuth, teamController.updateTeam);
router.post('/:id/members', requireAuth, teamController.addTeamMember);
router.delete('/:id/members/:userId', requireAuth, teamController.removeTeamMember);

export default router;
