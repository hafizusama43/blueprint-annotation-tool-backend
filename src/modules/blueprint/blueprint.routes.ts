import { Router } from 'express';
import * as blueprintController from './blueprint.controller';
import { blueprintUpload } from '../../middleware/upload.middleware';

const router = Router();

router.get('/', blueprintController.getAllBlueprints);
router.get('/:id', blueprintController.getBlueprintById);
router.post('/upload', blueprintUpload.single('file'), blueprintController.uploadBlueprint);
router.post('/', blueprintController.createBlueprint);

export default router;
