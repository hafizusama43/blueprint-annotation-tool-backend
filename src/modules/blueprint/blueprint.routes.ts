import { Router } from 'express';
import * as blueprintController from './blueprint.controller';
import { validateBody } from '../../middleware/validation.middleware';
import {
    presignedUploadRequestSchema,
    uploadBlueprintSchema,
} from '../../schemas/blueprint.schemas';

const router = Router();

router.get('/', blueprintController.getAllBlueprints);
router.get('/:id/status', blueprintController.getBlueprintProcessingStatus);
router.get('/:id', blueprintController.getBlueprintById);
router.post('/upload', validateBody(uploadBlueprintSchema), blueprintController.uploadBlueprint);
router.post(
    '/presigned-upload-url',
    validateBody(presignedUploadRequestSchema),
    blueprintController.getPreSignedUrl,
);
router.put('/:id/process', blueprintController.retryBlueprintProcessing);
router.post('/retry-processing', blueprintController.retryBlueprintProcessing);
router.post('/', blueprintController.createBlueprint);
router.delete('/:id', blueprintController.deleteBlueprint);

export default router;
