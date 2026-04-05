import { randomUUID } from 'node:crypto';
import type {
    AppGlobalRole,
    AuthSession,
    LoginEvent,
    Prisma,
    User,
    UserRole,
    UserTokenType,
} from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { createError } from '../../middleware/error.middleware';
import { deleteKeys, getOrSetJson } from '../../services/cache/cache.service';
import { cacheKeys } from '../../services/cache/keys';
import {
    createAccessToken,
    createRefreshToken,
    generateOpaqueToken,
    generateSessionToken,
    hashOpaqueToken,
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
    workspaceType?: 'personal' | 'organization';
    organizationName?: string;
    organizationSlug?: string;
    projectName?: string;
    teamName?: string;
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

export type RegisterResult = {
    user: User;
    organizationId: string;
    projectId: string;
    verificationToken: string;
};

type UserWithMemberships = User & {
    organizationMemberships: Array<{
        organizationId: string;
        role: UserRole;
    }>;
};

function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function buildWorkspaceName(input: RegisterInput): string {
    return (
        input.organizationName ??
        input.displayName?.trim() ??
        input.firstName?.trim() ??
        input.email.split('@')[0] ??
        'Workspace'
    );
}

function getPrimaryMembership(user: UserWithMemberships) {
    return user.organizationMemberships[0];
}

function buildTokens(user: UserWithMemberships, session: AuthSession): AuthTokens {
    const membership = getPrimaryMembership(user);
    const payload = {
        sub: user.id,
        sid: session.id,
        orgId: membership?.organizationId,
        role: membership?.role,
        globalRole: user.globalRole,
    };

    return {
        accessToken: createAccessToken(payload),
        refreshToken: createRefreshToken(payload),
        sessionId: session.id,
        expiresAt: session.expiresAt,
    };
}

async function logLoginEvent(data: Prisma.LoginEventUncheckedCreateInput): Promise<LoginEvent> {
    return prisma.loginEvent.create({ data });
}

async function getUserForAuth(email: string): Promise<UserWithMemberships | null> {
    return prisma.user.findUnique({
        where: { email },
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
    });
}

async function createUserToken(userId: string, type: UserTokenType, ttlMs: number, metadata?: unknown) {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + ttlMs);

    await prisma.userToken.create({
        data: {
            userId,
            type,
            tokenHash,
            expiresAt,
            metadata:
                metadata && typeof metadata === 'object'
                    ? (metadata as Prisma.InputJsonValue)
                    : undefined,
        },
    });

    return rawToken;
}

async function consumeUserToken(rawToken: string, type: UserTokenType) {
    const tokenHash = hashOpaqueToken(rawToken);
    const token = await prisma.userToken.findFirst({
        where: {
            tokenHash,
            type,
            consumedAt: null,
            expiresAt: {
                gt: new Date(),
            },
        },
    });

    if (!token) {
        throw createError('Token is invalid or expired', 400);
    }

    await prisma.userToken.update({
        where: { id: token.id },
        data: {
            consumedAt: new Date(),
        },
    });

    return token;
}

async function revokeSessions(userId: string, exceptSessionId?: string) {
    await prisma.authSession.updateMany({
        where: {
            userId,
            revokedAt: null,
            ...(exceptSessionId
                ? {
                      id: {
                          not: exceptSessionId,
                      },
                  }
                : {}),
        },
        data: {
            revokedAt: new Date(),
            revokeReason: 'security_event',
        },
    });
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

    const nextTokens = buildTokens(user, session);
    await prisma.authSession.update({
        where: { id: session.id },
        data: {
            refreshTokenHash: hashRefreshToken(nextTokens.refreshToken),
        },
    });

    return nextTokens;
}

async function incrementFailedLogin(email: string, userId?: string) {
    if (!userId) {
        return;
    }

    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            failedSignInCount: {
                increment: 1,
            },
        },
        select: {
            failedSignInCount: true,
        },
    });

    if (user.failedSignInCount >= env.AUTH_MAX_FAILED_ATTEMPTS) {
        await prisma.user.update({
            where: { id: userId },
            data: {
                lockedUntil: new Date(Date.now() + env.AUTH_LOCK_MINUTES * 60 * 1000),
            },
        });
    }

    await logLoginEvent({
        userId,
        email,
        eventType: 'FAILED_SIGN_IN',
        success: false,
    });
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
    const existing = await prisma.user.findUnique({
        where: { email: input.email },
    });

    if (existing) {
        throw createError('A user with this email already exists', 409);
    }

    const workspaceType = input.workspaceType ?? 'personal';
    const workspaceName = buildWorkspaceName(input);
    const orgSlugBase = slugify(input.organizationSlug ?? workspaceName) || 'workspace';
    const projectName =
        input.projectName ??
        (workspaceType === 'personal'
            ? env.DEFAULT_PERSONAL_PROJECT_NAME
            : env.DEFAULT_ORGANIZATION_PROJECT_NAME);

    const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                email: input.email,
                passwordHash: hashPassword(input.password),
                firstName: input.firstName ?? null,
                lastName: input.lastName ?? null,
                displayName: input.displayName ?? null,
                status: 'ACTIVE',
            },
        });

        const organization = await tx.organization.create({
            data: {
                name:
                    workspaceType === 'personal' ? `${workspaceName} Workspace` : workspaceName,
                slug: `${orgSlugBase}-${user.id.slice(-6)}`,
                ownerId: user.id,
                personalWorkspace: workspaceType === 'personal',
                collaborationEnabled: workspaceType !== 'personal',
                memberships: {
                    create: {
                        userId: user.id,
                        role: 'ADMIN',
                        status: 'ACTIVE',
                    },
                },
            },
        });

        let teamId: string | undefined;
        if (workspaceType === 'organization' && input.teamName) {
            const team = await tx.team.create({
                data: {
                    organizationId: organization.id,
                    name: input.teamName,
                    slug: `${slugify(input.teamName) || 'team'}-${user.id.slice(-4)}`,
                    createdByUserId: user.id,
                },
            });
            teamId = team.id;

            await tx.teamMember.create({
                data: {
                    teamId,
                    userId: user.id,
                    role: 'ADMIN',
                    status: 'ACTIVE',
                },
            });
        }

        const project = await tx.project.create({
            data: {
                organizationId: organization.id,
                teamId,
                name: projectName,
                slug: `${slugify(projectName) || 'project'}-${user.id.slice(-4)}`,
                createdByUserId: user.id,
                collaborationEnabled: workspaceType === 'personal' ? false : true,
            },
        });

        const verificationToken = generateOpaqueToken();
        await tx.userToken.create({
            data: {
                userId: user.id,
                type: 'EMAIL_VERIFICATION',
                tokenHash: hashOpaqueToken(verificationToken),
                expiresAt: new Date(
                    Date.now() + env.JWT_EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
                ),
            },
        });

        return {
            user,
            organizationId: organization.id,
            projectId: project.id,
            verificationToken,
        };
    });

    return result;
}

export async function login(input: LoginInput): Promise<AuthTokens> {
    const user = await getUserForAuth(input.email);

    if (!user || !user.passwordHash) {
        await logLoginEvent({
            email: input.email,
            eventType: 'FAILED_SIGN_IN',
            success: false,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
        });
        throw createError('Invalid email or password', 401);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        throw createError('Account is temporarily locked. Please try again later.', 423);
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
        await incrementFailedLogin(input.email, user.id);
        throw createError('Invalid email or password', 401);
    }

    if (!user.emailVerifiedAt) {
        throw createError('Please verify your email before signing in', 403);
    }

    const tokens = await createSessionForUser(user, input);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            lastLoginAt: new Date(),
            failedSignInCount: 0,
            lockedUntil: null,
        },
    });
    await deleteKeys(cacheKeys.user(user.id));

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
        await prisma.authSession.updateMany({
            where: {
                userId: session.userId,
                tokenFamily: session.tokenFamily ?? undefined,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
                revokeReason: 'refresh_token_reuse_detected',
            },
        });

        await logLoginEvent({
            userId: session.user.id,
            sessionId: session.id,
            email: session.user.email,
            eventType: 'SESSION_REVOKED',
            success: false,
            ipAddress: input.ipAddress ?? session.ipAddress,
            userAgent: input.userAgent ?? session.userAgent,
            metadata: {
                reason: 'refresh_token_reuse_detected',
            },
        });

        throw createError('Refresh token does not match the active session', 401);
    }

    const nextTokens = buildTokens(session.user as UserWithMemberships, session);
    await prisma.authSession.update({
        where: { id: session.id },
        data: {
            refreshTokenHash: hashRefreshToken(nextTokens.refreshToken),
            lastSeenAt: new Date(),
            userAgent: input.userAgent ?? session.userAgent,
            ipAddress: input.ipAddress ?? session.ipAddress,
            rotationCounter: {
                increment: 1,
            },
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

    return nextTokens;
}

export async function verifyEmail(token: string): Promise<void> {
    const verificationToken = await consumeUserToken(token, 'EMAIL_VERIFICATION');

    await prisma.user.update({
        where: { id: verificationToken.userId },
        data: {
            emailVerifiedAt: new Date(),
        },
    });
    await deleteKeys(cacheKeys.user(verificationToken.userId));
}

export async function requestPasswordReset(email: string): Promise<{ resetToken?: string }> {
    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        return {};
    }

    const resetToken = await createUserToken(
        user.id,
        'PASSWORD_RESET',
        env.JWT_PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    );

    return { resetToken };
}

export async function resetPassword(token: string, password: string): Promise<void> {
    const resetToken = await consumeUserToken(token, 'PASSWORD_RESET');
    await prisma.user.update({
        where: { id: resetToken.userId },
        data: {
            passwordHash: hashPassword(password),
            passwordChangedAt: new Date(),
            failedSignInCount: 0,
            lockedUntil: null,
        },
    });
    await deleteKeys(cacheKeys.user(resetToken.userId));

    await revokeSessions(resetToken.userId);
    await logLoginEvent({
        userId: resetToken.userId,
        eventType: 'PASSWORD_CHANGED',
        success: true,
    });
}

export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string,
): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    if (!user?.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
        throw createError('Current password is incorrect', 400);
    }

    await prisma.user.update({
        where: { id: userId },
        data: {
            passwordHash: hashPassword(newPassword),
            passwordChangedAt: new Date(),
            failedSignInCount: 0,
            lockedUntil: null,
        },
    });
    await deleteKeys(cacheKeys.user(userId));

    await revokeSessions(userId, currentSessionId);
    await logLoginEvent({
        userId,
        sessionId: currentSessionId ?? null,
        eventType: 'PASSWORD_CHANGED',
        success: true,
    });
}

export async function acceptInvitation(token: string, password?: string): Promise<void> {
    const invitationToken = await consumeUserToken(token, 'INVITATION_ACCEPT');
    const metadata =
        invitationToken.metadata && typeof invitationToken.metadata === 'object'
            ? (invitationToken.metadata as Record<string, unknown>)
            : {};
    const membershipId =
        typeof metadata.organizationMemberId === 'string' ? metadata.organizationMemberId : null;

    if (membershipId) {
        await prisma.organizationMember.update({
            where: { id: membershipId },
            data: {
                status: 'ACTIVE',
            },
        });
    }

    if (password) {
        await prisma.user.update({
            where: { id: invitationToken.userId },
            data: {
                passwordHash: hashPassword(password),
                emailVerifiedAt: new Date(),
            },
        });
    }
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
            revokeReason: 'user_logout',
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
            revokeReason: 'logout_other_sessions',
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
    return getOrSetJson(cacheKeys.user(userId), () =>
        prisma.user.findUnique({
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
        }),
    );
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

export async function getUserById(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
    });
}

export async function updateGlobalRole(userId: string, globalRole: AppGlobalRole) {
    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            globalRole,
        },
    });
    await deleteKeys(cacheKeys.user(userId));
    return user;
}
