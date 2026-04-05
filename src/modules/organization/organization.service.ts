import type { Prisma, UserRole } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { createError } from '../../middleware/error.middleware';
import { deleteKeys, getOrSetJson } from '../../services/cache/cache.service';
import { cacheKeys } from '../../services/cache/keys';
import { sendOrganizationInvitationEmail } from '../../services/email/email.service';
import {
    createNotification,
    createNotificationDelivery,
    markNotificationDeliveryFailed,
    markNotificationDeliverySent,
} from '../../services/notification/notification.service';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/auth.utils';

export type OrganizationPayload = {
    name: string;
    slug: string;
    description?: string | null;
    billingEmail?: string | null;
    personalWorkspace?: boolean;
    collaborationEnabled?: boolean;
    ownerId?: string;
};

export type OrganizationMemberPayload = {
    organizationId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    teamId: string;
    role: UserRole;
    invitedByUserId?: string;
};

function buildUserDisplayName(user: {
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    email?: string | null;
}) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return user.displayName || fullName || user.email || undefined;
}

export async function getOrganizations(userId?: string) {
    return prisma.organization.findMany({
        where: userId
            ? {
                  memberships: {
                      some: {
                          userId,
                          status: 'ACTIVE',
                      },
                  },
              }
            : undefined,
        include: {
            owner: true,
            memberships: true,
            projects: {
                orderBy: {
                    createdAt: 'desc',
                },
            },
            teams: {
                orderBy: {
                    createdAt: 'desc',
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function getOrganizationById(id: string) {
    return getOrSetJson(cacheKeys.organization(id), () =>
        prisma.organization.findUnique({
            where: { id },
            include: {
                owner: true,
                memberships: {
                    include: {
                        user: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                teams: true,
                projects: true,
                subscriptions: {
                    include: {
                        plan: true,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
            },
        }),
    );
}

export async function updateOrganization(
    id: string,
    data: {
        name?: string;
        description?: string | null;
        billingEmail?: string | null;
        collaborationEnabled?: boolean;
    },
) {
    const organization = await prisma.organization.update({
        where: { id },
        data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description ?? null } : {}),
            ...(data.billingEmail !== undefined ? { billingEmail: data.billingEmail ?? null } : {}),
            ...(data.collaborationEnabled !== undefined
                ? { collaborationEnabled: data.collaborationEnabled }
                : {}),
        },
        include: {
            owner: true,
            memberships: true,
        },
    });

    await deleteKeys(cacheKeys.organization(id));
    return organization;
}

export async function updateOrganizationStatus(id: string, status: 'ACTIVE' | 'TRIALING' | 'SUSPENDED') {
    const organization = await prisma.organization.update({
        where: { id },
        data: { status },
    });
    await deleteKeys(cacheKeys.organization(id));
    return organization;
}

export async function removeOrganizationMember(organizationId: string, userId: string) {
    const membership = await prisma.organizationMember.update({
        where: {
            organizationId_userId: {
                organizationId,
                userId,
            },
        },
        data: {
            status: 'REMOVED',
        },
    });
    await deleteKeys(cacheKeys.organization(organizationId), cacheKeys.user(userId));
    return membership;
}

export async function createOrganization(data: OrganizationPayload) {
    const createData: Prisma.OrganizationCreateInput = {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        billingEmail: data.billingEmail ?? null,
        personalWorkspace: data.personalWorkspace ?? false,
        collaborationEnabled: data.collaborationEnabled ?? false,
        ...(data.ownerId
            ? {
                  owner: {
                      connect: {
                          id: data.ownerId,
                      },
                  },
                  memberships: {
                      create: {
                          user: {
                              connect: {
                                  id: data.ownerId,
                              },
                          },
                          role: 'ADMIN',
                      },
                  },
              }
            : {}),
    };

    const organization = await prisma.organization.create({
        data: createData,
        include: {
            owner: true,
            memberships: true,
        },
    });
    await deleteKeys(cacheKeys.organization(organization.id));
    return organization;
}

export async function addOrganizationMember(data: OrganizationMemberPayload) {
    const invite = await prisma.$transaction(async (tx) => {
        const team = await tx.team.findUnique({
            where: { id: data.teamId },
            select: { organizationId: true, name: true },
        });

        if (!team || team.organizationId !== data.organizationId) {
            throw createError('Selected team does not belong to this organization', 400);
        }

        const inviter = data.invitedByUserId
            ? await tx.user.findUnique({
                  where: { id: data.invitedByUserId },
                  select: {
                      firstName: true,
                      lastName: true,
                      displayName: true,
                      email: true,
                  },
              })
            : null;

        const normalizedEmail = data.email.trim();
        let user = await tx.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!user) {
            user = await tx.user.create({
                data: {
                    email: normalizedEmail,
                    firstName: data.firstName ?? null,
                    lastName: data.lastName ?? null,
                    displayName: data.displayName ?? null,
                    status: 'INVITED',
                },
            });
        } else {
            const existingMembership = await tx.organizationMember.findUnique({
                where: {
                    organizationId_userId: {
                        organizationId: data.organizationId,
                        userId: user.id,
                    },
                },
                select: {
                    id: true,
                },
            });

            if (existingMembership) {
                throw createError('A user with this email is already a member of this organization', 409);
            }

            if (!user.firstName || !user.lastName || !user.displayName) {
                user = await tx.user.update({
                    where: { id: user.id },
                    data: {
                        ...(user.firstName ? {} : { firstName: data.firstName ?? null }),
                        ...(user.lastName ? {} : { lastName: data.lastName ?? null }),
                        ...(user.displayName ? {} : { displayName: data.displayName ?? null }),
                    },
                });
            }
        }

        const organizationMembership = await tx.organizationMember.create({
            data: {
                organization: {
                    connect: {
                        id: data.organizationId,
                    },
                },
                user: {
                    connect: {
                        id: user.id,
                    },
                },
                role: data.role,
                status: 'INVITED',
                invitedBy: data.invitedByUserId
                    ? {
                          connect: {
                              id: data.invitedByUserId,
                          },
                      }
                    : undefined,
            },
            include: {
                organization: true,
                user: true,
            },
        });

        const teamMembership = await tx.teamMember.upsert({
            where: {
                teamId_userId: {
                    teamId: data.teamId,
                    userId: user.id,
                },
            },
            update: {
                role: data.role,
                status: 'INVITED',
                invitedByUserId: data.invitedByUserId ?? null,
            },
            create: {
                team: {
                    connect: {
                        id: data.teamId,
                    },
                },
                user: {
                    connect: {
                        id: user.id,
                    },
                },
                role: data.role,
                status: 'INVITED',
                invitedBy: data.invitedByUserId
                    ? {
                          connect: {
                              id: data.invitedByUserId,
                          },
                      }
                    : undefined,
            },
            include: {
                team: true,
                user: true,
            },
        });

        const invitationToken = generateOpaqueToken();
        await tx.userToken.create({
            data: {
                userId: user.id,
                type: 'INVITATION_ACCEPT',
                tokenHash: hashOpaqueToken(invitationToken),
                expiresAt: new Date(
                    Date.now() + env.JWT_EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
                ),
                metadata: {
                    organizationId: data.organizationId,
                    organizationMemberId: organizationMembership.id,
                    teamId: data.teamId,
                    teamMemberId: teamMembership.id,
                },
            },
        });

        const notification = await createNotification(
            {
                userId: user.id,
                type: 'ORG_MEMBER_INVITATION',
                title: `Invitation to join ${organizationMembership.organization.name}`,
                message: `You have been invited to join ${organizationMembership.organization.name} and assigned to the ${team.name} team.`,
                metadata: {
                    organizationId: data.organizationId,
                    organizationMemberId: organizationMembership.id,
                    teamId: data.teamId,
                    teamMemberId: teamMembership.id,
                },
            },
            tx,
        );

        const notificationDelivery = await createNotificationDelivery(
            {
                notificationId: notification.id,
                channel: 'EMAIL',
                recipient: user.email,
                subject: `Invitation to join ${organizationMembership.organization.name}`,
                provider: env.EMAIL_PROVIDER,
                metadata: {
                    organizationId: data.organizationId,
                    teamId: data.teamId,
                    notificationType: 'ORG_MEMBER_INVITATION',
                },
            },
            tx,
        );

        return {
            user,
            organizationMembership,
            teamMembership,
            notification,
            notificationDelivery,
            invitationToken,
            organizationName: organizationMembership.organization.name,
            teamName: team.name,
            inviterName: inviter ? buildUserDisplayName(inviter) : undefined,
        };
    });

    const acceptUrl = new URL('/accept-invitation', env.FRONTEND_URL);
    acceptUrl.searchParams.set('token', invite.invitationToken);
    const emailDelivery = await sendOrganizationInvitationEmail({
        to: {
            email: invite.user.email,
            name: buildUserDisplayName(invite.user),
        },
        organizationName: invite.organizationName,
        teamName: invite.teamName,
        inviterName: invite.inviterName,
        acceptUrl: acceptUrl.toString(),
    });

    if (emailDelivery.sent) {
        await markNotificationDeliverySent(invite.notificationDelivery.id, {
            provider: emailDelivery.provider,
            externalMessageId: emailDelivery.messageId ?? null,
            metadata: {
                attempted: emailDelivery.attempted,
                provider: emailDelivery.provider,
            },
        });
    } else {
        await markNotificationDeliveryFailed(invite.notificationDelivery.id, {
            provider: emailDelivery.provider,
            errorMessage:
                emailDelivery.error ??
                (emailDelivery.attempted
                    ? 'Email delivery failed'
                    : 'Email delivery skipped because the provider is disabled'),
            metadata: {
                attempted: emailDelivery.attempted,
                provider: emailDelivery.provider,
            },
        });
    }

    await deleteKeys(
        cacheKeys.organization(data.organizationId),
        cacheKeys.user(invite.user.id),
    );
    return {
        ...invite,
        acceptUrl: acceptUrl.toString(),
        emailDelivery,
    };
}
