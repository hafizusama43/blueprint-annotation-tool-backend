import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as shapeController from './shape.controller';

const router = Router();

router.get('/', requireAuth, shapeController.getAllShapes);
router.get('/:id', requireAuth, shapeController.getShapeById);
router.post('/', requireAuth, shapeController.createShape);
router.patch('/:id', requireAuth, shapeController.updateShape);
router.delete('/:id', requireAuth, shapeController.deleteShape);

export default router;
