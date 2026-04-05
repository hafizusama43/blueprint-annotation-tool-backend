import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { deleteKeys, getOrSetJson } from '../../services/cache/cache.service';
import { cacheKeys } from '../../services/cache/keys';

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
    userId: string;
    role: import('@prisma/client').UserRole;
    invitedByUserId?: string;
};

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
    const membership = await prisma.organizationMember.upsert({
        where: {
            organizationId_userId: {
                organizationId: data.organizationId,
                userId: data.userId,
            },
        },
        update: {
            role: data.role,
            status: 'ACTIVE',
            invitedByUserId: data.invitedByUserId ?? null,
        },
        create: {
            organization: {
                connect: {
                    id: data.organizationId,
                },
            },
            user: {
                connect: {
                    id: data.userId,
                },
            },
            role: data.role,
            status: 'ACTIVE',
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
    await deleteKeys(
        cacheKeys.organization(data.organizationId),
        cacheKeys.user(data.userId),
    );
    return membership;
}
