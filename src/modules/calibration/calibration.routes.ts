import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as calibrationController from './calibration.controller';

const router = Router();

router.get('/', requireAuth, calibrationController.getAllCalibrations);
router.get('/:id', requireAuth, calibrationController.getCalibrationById);
router.post('/', requireAuth, calibrationController.createCalibration);
router.patch('/:id', requireAuth, calibrationController.updateCalibration);
router.delete('/:id', requireAuth, calibrationController.deleteCalibration);

export default router;
