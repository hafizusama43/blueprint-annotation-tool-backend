import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type OrganizationPayload = {
    name: string;
    slug: string;
    description?: string;
    billingEmail?: string;
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
    return prisma.organization.findUnique({
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
    });
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

    return prisma.organization.create({
        data: createData,
        include: {
            owner: true,
            memberships: true,
        },
    });
}

export async function addOrganizationMember(data: OrganizationMemberPayload) {
    return prisma.organizationMember.upsert({
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
}
