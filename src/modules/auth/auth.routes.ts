import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import * as authController from './auth.controller';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/accept-invitation', authController.acceptInvitation);
router.get('/invitation-details', authController.getInvitationDetails);
router.post('/logout', requireAuth, authController.logout);
router.post('/logout-other-sessions', requireAuth, authController.logoutOtherSessions);
router.post('/change-password', requireAuth, authController.changePassword);
router.get('/me', requireAuth, authController.me);
router.get('/sessions', requireAuth, authController.getSessions);

export default router;
