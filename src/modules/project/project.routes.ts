import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as projectController from './project.controller';

const router = Router();

router.get('/', requireAuth, projectController.getProjects);
router.get('/:id', requireAuth, projectController.getProjectById);
router.post('/', requireAuth, projectController.createProject);
router.patch('/:id', requireAuth, projectController.updateProject);
router.post('/:id/archive', requireAuth, projectController.archiveProject);
router.post('/:id/collaborators', requireAuth, projectController.addProjectCollaborator);
router.delete('/:id/collaborators/:userId', requireAuth, projectController.removeProjectCollaborator);

export default router;
