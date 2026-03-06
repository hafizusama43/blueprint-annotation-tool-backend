import { Router } from 'express';
import * as calibrationController from './calibration.controller';

const router = Router();

router.get('/', calibrationController.getAllCalibrations);
router.get('/:id', calibrationController.getCalibrationById);
router.post('/', calibrationController.createCalibration);

export default router;
