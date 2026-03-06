import { Router } from 'express';
import * as blueprintController from './blueprint.controller';
import { blueprintUpload } from '../../middleware/upload.middleware';

const router = Router();

router.get('/', blueprintController.getAllBlueprints);
router.get('/:id/status', blueprintController.getBlueprintProcessingStatus);
router.get('/:id', blueprintController.getBlueprintById);
router.post('/upload', blueprintUpload.single('file'), blueprintController.uploadBlueprint);
router.post('/:id/retry-processing', blueprintController.retryBlueprintProcessing);
router.post('/', blueprintController.createBlueprint);
router.delete('/:id', blueprintController.deleteBlueprint);

export default router;
