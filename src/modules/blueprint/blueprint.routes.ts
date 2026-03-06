import { Router } from 'express';
import * as blueprintController from './blueprint.controller';

const router = Router();

router.get('/', blueprintController.getAllBlueprints);
router.get('/:id', blueprintController.getBlueprintById);
router.post('/', blueprintController.createBlueprint);

export default router;
