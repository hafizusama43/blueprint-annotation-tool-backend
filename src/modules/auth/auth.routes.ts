import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as authController from './auth.controller';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', requireAuth, authController.logout);
router.post('/logout-other-sessions', requireAuth, authController.logoutOtherSessions);
router.get('/me', requireAuth, authController.me);
router.get('/sessions', requireAuth, authController.getSessions);

export default router;
