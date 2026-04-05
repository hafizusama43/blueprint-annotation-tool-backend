import { NextFunction, Request, Response } from 'express';
import { AppGlobalRole, UserRole } from '@prisma/client';
import { createError } from './error.middleware';
import { verifyAccessToken } from '../modules/auth/auth.utils';

function getBearerToken(req: Request): string | null {
    const authorization = req.header('authorization');
    if (!authorization) {
        return null;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return null;
    }

    return token;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = getBearerToken(req);

    if (!token) {
        return next(createError('Authentication required', 401));
    }

    try {
        const payload = verifyAccessToken(token);
        req.auth = {
            userId: payload.sub,
            sessionId: payload.sid,
            organizationId: payload.orgId,
            role: payload.role as UserRole | undefined,
            globalRole: payload.globalRole as AppGlobalRole | undefined,
        };
        next();
    } catch (error) {
        next(createError('Invalid or expired access token', 401, error));
    }
}

export function requireRole(...roles: UserRole[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }

        if (!(req.auth.role && roles.includes(req.auth.role))) {
            return next(createError('You do not have permission to access this resource', 403));
        }

        next();
    };
}

export function requireGlobalRole(...roles: AppGlobalRole[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }

        if (!(req.auth.globalRole && roles.includes(req.auth.globalRole))) {
            return next(createError('You do not have global permission to access this resource', 403));
        }

        next();
    };
}
