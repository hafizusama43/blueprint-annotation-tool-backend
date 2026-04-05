import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as blueprintController from './blueprint.controller';
import { validateBody } from '../../middleware/validation.middleware';
import {
    presignedUploadRequestSchema,
    uploadBlueprintSchema,
} from '../../schemas/blueprint.schemas';

const router = Router();

router.get('/', requireAuth, blueprintController.getAllBlueprints);
router.get('/:id/status', requireAuth, blueprintController.getBlueprintProcessingStatus);
router.get('/:id', requireAuth, blueprintController.getBlueprintById);
router.post('/upload', requireAuth, validateBody(uploadBlueprintSchema), blueprintController.uploadBlueprint);
router.post(
    '/presigned-upload-url',
    requireAuth,
    validateBody(presignedUploadRequestSchema),
    blueprintController.getPreSignedUrl,
);
router.put('/:id/process', requireAuth, blueprintController.retryBlueprintProcessing);
router.post('/retry-processing', requireAuth, blueprintController.retryBlueprintProcessing);
router.post('/', requireAuth, blueprintController.createBlueprint);
router.delete('/:id', requireAuth, blueprintController.deleteBlueprint);

export default router;
