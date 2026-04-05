import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
import * as authService from './auth.service';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    deviceName: z.string().min(1).optional(),
});

const refreshSchema = z.object({
    refreshToken: z.string().min(1),
});

function getRequestMetadata(req: Request) {
    return {
        userAgent: req.get('user-agent') ?? undefined,
        ipAddress: req.ip,
    };
}

export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = registerSchema.parse(req.body);
        const user = await authService.register(payload);
        res.status(201).json(user);
    } catch (error) {
        next(error);
    }
}

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = loginSchema.parse(req.body);
        const result = await authService.login({
            ...payload,
            ...getRequestMetadata(req),
        });
        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = refreshSchema.parse(req.body);
        const result = await authService.refreshSession({
            ...payload,
            ...getRequestMetadata(req),
        });
        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }

        await authService.logoutSession(req.auth.userId, req.auth.sessionId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}

export async function logoutOtherSessions(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }

        await authService.logoutOtherSessions(req.auth.userId, req.auth.sessionId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}

export async function me(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }

        const user = await authService.getCurrentUser(req.auth.userId);
        if (!user) {
            return next(createError('User not found', 404));
        }

        res.json(user);
    } catch (error) {
        next(error);
    }
}

export async function getSessions(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }

        const sessions = await authService.getActiveSessions(req.auth.userId);
        res.json(sessions);
    } catch (error) {
        next(error);
    }
}
