import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';

export type ProjectPayload = {
    organizationId: string;
    teamId?: string;
    name: string;
    slug: string;
    description?: string;
    collaborationEnabled?: boolean | null;
    createdByUserId?: string;
};

export type ProjectCollaboratorPayload = {
    projectId: string;
    userId: string;
    role: UserRole;
    teamId?: string;
    addedByUserId?: string;
};

export async function getProjects(organizationId?: string, teamId?: string) {
    return prisma.project.findMany({
        where: {
            ...(organizationId ? { organizationId } : {}),
            ...(teamId ? { teamId } : {}),
        },
        include: {
            organization: true,
            team: true,
            collaborators: {
                include: {
                    user: true,
                    team: true,
                },
            },
            blueprints: {
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

export async function getProjectById(id: string) {
    return prisma.project.findUnique({
        where: { id },
        include: {
            organization: true,
            team: true,
            collaborators: {
                include: {
                    user: true,
                    team: true,
                },
                orderBy: {
                    createdAt: 'asc',
                },
            },
            blueprints: {
                orderBy: {
                    createdAt: 'desc',
                },
            },
        },
    });
}

export async function createProject(data: ProjectPayload) {
    const createData: Prisma.ProjectCreateInput = {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        collaborationEnabled: data.collaborationEnabled ?? null,
        organization: {
            connect: {
                id: data.organizationId,
            },
        },
        ...(data.teamId
            ? {
                  team: {
                      connect: {
                          id: data.teamId,
                      },
                  },
              }
            : {}),
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

    return prisma.project.create({
        data: createData,
        include: {
            organization: true,
            team: true,
        },
    });
}

export async function addProjectCollaborator(data: ProjectCollaboratorPayload) {
    return prisma.projectCollaborator.upsert({
        where: {
            projectId_userId: {
                projectId: data.projectId,
                userId: data.userId,
            },
        },
        update: {
            role: data.role,
            accessSource: data.teamId ? 'TEAM' : 'DIRECT',
            teamId: data.teamId ?? null,
            addedByUserId: data.addedByUserId ?? null,
        },
        create: {
            project: {
                connect: {
                    id: data.projectId,
                },
            },
            user: {
                connect: {
                    id: data.userId,
                },
            },
            role: data.role,
            accessSource: data.teamId ? 'TEAM' : 'DIRECT',
            team: data.teamId
                ? {
                      connect: {
                          id: data.teamId,
                      },
                  }
                : undefined,
            addedBy: data.addedByUserId
                ? {
                      connect: {
                          id: data.addedByUserId,
                      },
                  }
                : undefined,
        },
        include: {
            project: true,
            user: true,
            team: true,
        },
    });
}
