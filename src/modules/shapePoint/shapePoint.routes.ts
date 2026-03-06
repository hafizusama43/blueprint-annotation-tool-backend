import { Router } from 'express';
import * as shapePointController from './shapePoint.controller';

const router = Router();

router.get('/', shapePointController.getAllShapePoints);
router.get('/:id', shapePointController.getShapePointById);
router.post('/', shapePointController.createShapePoint);

export default router;
