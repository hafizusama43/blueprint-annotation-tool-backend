import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type TeamPayload = {
    organizationId: string;
    name: string;
    slug: string;
    description?: string;
    createdByUserId?: string;
};

export type TeamMemberPayload = {
    teamId: string;
    userId: string;
    role: UserRole;
    invitedByUserId?: string;
};

export async function getTeams(organizationId?: string) {
    return prisma.team.findMany({
        where: organizationId ? { organizationId } : undefined,
        include: {
            organization: true,
            members: {
                include: {
                    user: true,
                },
            },
            projects: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function getTeamById(id: string) {
    return prisma.team.findUnique({
        where: { id },
        include: {
            organization: true,
            members: {
                include: {
                    user: true,
                },
                orderBy: {
                    createdAt: 'asc',
                },
            },
            projects: true,
        },
    });
}

export async function createTeam(data: TeamPayload) {
    const createData: Prisma.TeamCreateInput = {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        organization: {
            connect: {
                id: data.organizationId,
            },
        },
        ...(data.createdByUserId
            ? {
                  createdBy: {
                      connect: {
                          id: data.createdByUserId,
                      },
                  },
              }
            : {}),
    };

    return prisma.team.create({
        data: createData,
        include: {
            organization: true,
        },
    });
}

export async function addTeamMember(data: TeamMemberPayload) {
    return prisma.teamMember.upsert({
        where: {
            teamId_userId: {
                teamId: data.teamId,
                userId: data.userId,
            },
        },
        update: {
            role: data.role,
            status: 'ACTIVE',
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
                    id: data.userId,
                },
            },
            role: data.role,
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
}
