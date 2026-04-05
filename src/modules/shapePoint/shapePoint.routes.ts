import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as shapePointController from './shapePoint.controller';

const router = Router();

router.get('/', requireAuth, shapePointController.getAllShapePoints);
router.get('/:id', requireAuth, shapePointController.getShapePointById);
router.post('/', requireAuth, shapePointController.createShapePoint);
router.patch('/:id', requireAuth, shapePointController.updateShapePoint);
router.delete('/:id', requireAuth, shapePointController.deleteShapePoint);

export default router;
