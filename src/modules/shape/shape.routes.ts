import { Router } from 'express';
import * as shapeController from './shape.controller';

const router = Router();

router.get('/', shapeController.getAllShapes);
router.get('/:id', shapeController.getShapeById);
router.post('/', shapeController.createShape);

export default router;
