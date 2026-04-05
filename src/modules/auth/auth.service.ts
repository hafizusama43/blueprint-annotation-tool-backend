import { randomUUID } from 'node:crypto';
import type { AuthSession, LoginEvent, Prisma, User } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { createError } from '../../middleware/error.middleware';
import {
    createAccessToken,
    createRefreshToken,
    generateSessionToken,
    hashPassword,
    hashRefreshToken,
    verifyPassword,
    verifyRefreshToken,
} from './auth.utils';

export type RegisterInput = {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
};

export type LoginInput = {
    email: string;
    password: string;
    userAgent?: string;
    ipAddress?: string;
    deviceName?: string;
};

export type RefreshInput = {
    refreshToken: string;
    userAgent?: string;
    ipAddress?: string;
};

export type AuthTokens = {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    expiresAt: Date;
};

type UserWithMemberships = User & {
    organizationMemberships: Array<{
        organizationId: string;
        role: import('@prisma/client').UserRole;
    }>;
};

function getPrimaryMembership(user: UserWithMemberships) {
    return user.organizationMemberships[0];
}

function buildTokens(user: UserWithMemberships, session: AuthSession): AuthTokens {
    const membership = getPrimaryMembership(user);
    const accessToken = createAccessToken({
        sub: user.id,
        sid: session.id,
        orgId: membership?.organizationId,
        role: membership?.role,
    });
    const refreshToken = createRefreshToken({
        sub: user.id,
        sid: session.id,
        orgId: membership?.organizationId,
        role: membership?.role,
    });

    return {
        accessToken,
        refreshToken,
        sessionId: session.id,
        expiresAt: session.expiresAt,
    };
}

async function logLoginEvent(data: Prisma.LoginEventUncheckedCreateInput): Promise<LoginEvent> {
    return prisma.loginEvent.create({ data });
}

async function createSessionForUser(
    user: UserWithMemberships,
    options: {
        userAgent?: string;
        ipAddress?: string;
        deviceName?: string;
    },
): Promise<AuthTokens> {
    const refreshTokenHash = hashRefreshToken(generateSessionToken());
    const tokenFamily = randomUUID();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const session = await prisma.authSession.create({
        data: {
            userId: user.id,
            refreshTokenHash,
            tokenFamily,
            deviceName: options.deviceName ?? null,
            userAgent: options.userAgent ?? null,
            ipAddress: options.ipAddress ?? null,
            lastSeenAt: new Date(),
            expiresAt,
        },
    });

    const tokens = buildTokens(user, session);
    const refreshJwt = createRefreshToken({
        sub: user.id,
        sid: session.id,
        orgId: user.organizationMemberships[0]?.organizationId,
        role: user.organizationMemberships[0]?.role,
    });

    await prisma.authSession.update({
        where: { id: session.id },
        data: {
            refreshTokenHash: hashRefreshToken(refreshJwt),
        },
    });

    return {
        ...tokens,
        refreshToken: refreshJwt,
    };
}

async function getUserForAuth(email: string): Promise<UserWithMemberships | null> {
    return prisma.user.findUnique({
        where: {
            email,
        },
        include: {
            organizationMemberships: {
                where: {
                    status: 'ACTIVE',
                },
                orderBy: {
                    createdAt: 'asc',
                },
                select: {
                    organizationId: true,
                    role: true,
                },
            },
        },
    });
}

export async function register(input: RegisterInput): Promise<User> {
    const existing = await prisma.user.findUnique({
        where: { email: input.email },
    });

    if (existing) {
        throw createError('A user with this email already exists', 409);
    }

    return prisma.user.create({
        data: {
            email: input.email,
            passwordHash: hashPassword(input.password),
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            displayName: input.displayName ?? null,
        },
    });
}

export async function login(input: LoginInput): Promise<AuthTokens> {
    const user = await getUserForAuth(input.email);

    if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
        await logLoginEvent({
            email: input.email,
            eventType: 'FAILED_SIGN_IN',
            success: false,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
        });
        throw createError('Invalid email or password', 401);
    }

    const tokens = await createSessionForUser(user, input);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            lastLoginAt: new Date(),
        },
    });

    await logLoginEvent({
        userId: user.id,
        sessionId: tokens.sessionId,
        email: user.email,
        eventType: 'SIGN_IN',
        success: true,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
    });

    return tokens;
}

export async function refreshSession(input: RefreshInput): Promise<AuthTokens> {
    const payload = verifyRefreshToken(input.refreshToken);
    const session = await prisma.authSession.findUnique({
        where: { id: payload.sid },
        include: {
            user: {
                include: {
                    organizationMemberships: {
                        where: { status: 'ACTIVE' },
                        orderBy: { createdAt: 'asc' },
                        select: {
                            organizationId: true,
                            role: true,
                        },
                    },
                },
            },
        },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
        throw createError('Session is no longer valid', 401);
    }

    const incomingHash = hashRefreshToken(input.refreshToken);
    if (incomingHash !== session.refreshTokenHash) {
        throw createError('Refresh token does not match the active session', 401);
    }

    const nextTokens = buildTokens(session.user as UserWithMemberships, session);
    const nextRefreshToken = createRefreshToken({
        sub: session.user.id,
        sid: session.id,
        orgId: session.user.organizationMemberships[0]?.organizationId,
        role: session.user.organizationMemberships[0]?.role,
    });

    await prisma.authSession.update({
        where: { id: session.id },
        data: {
            refreshTokenHash: hashRefreshToken(nextRefreshToken),
            lastSeenAt: new Date(),
            userAgent: input.userAgent ?? session.userAgent,
            ipAddress: input.ipAddress ?? session.ipAddress,
        },
    });

    await logLoginEvent({
        userId: session.user.id,
        sessionId: session.id,
        email: session.user.email,
        eventType: 'TOKEN_REFRESH',
        success: true,
        ipAddress: input.ipAddress ?? session.ipAddress,
        userAgent: input.userAgent ?? session.userAgent,
    });

    return {
        ...nextTokens,
        refreshToken: nextRefreshToken,
    };
}

export async function logoutSession(userId: string, sessionId: string): Promise<void> {
    await prisma.authSession.updateMany({
        where: {
            id: sessionId,
            userId,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });

    await logLoginEvent({
        userId,
        sessionId,
        eventType: 'SIGN_OUT',
        success: true,
    });
}

export async function logoutOtherSessions(userId: string, currentSessionId: string): Promise<void> {
    await prisma.authSession.updateMany({
        where: {
            userId,
            id: {
                not: currentSessionId,
            },
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        },
    });

    await logLoginEvent({
        userId,
        sessionId: currentSessionId,
        eventType: 'SESSION_REVOKED',
        success: true,
        metadata: {
            scope: 'other_sessions',
        },
    });
}

export async function getCurrentUser(userId: string): Promise<UserWithMemberships | null> {
    return prisma.user.findUnique({
        where: { id: userId },
        include: {
            organizationMemberships: {
                where: { status: 'ACTIVE' },
                include: {
                    organization: true,
                },
                orderBy: {
                    createdAt: 'asc',
                },
            },
        },
    });
}

export async function getActiveSessions(userId: string): Promise<AuthSession[]> {
    return prisma.authSession.findMany({
        where: {
            userId,
            revokedAt: null,
            expiresAt: {
                gt: new Date(),
            },
        },
        orderBy: {
            updatedAt: 'desc',
        },
    });
}
