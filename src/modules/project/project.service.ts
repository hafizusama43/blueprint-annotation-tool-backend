import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { deleteKeys, getOrSetJson } from '../../services/cache/cache.service';
import { cacheKeys } from '../../services/cache/keys';

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
    return getOrSetJson(cacheKeys.project(id), () =>
        prisma.project.findUnique({
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
        }),
    );
}

export async function updateProject(
    id: string,
    data: {
        name?: string;
        description?: string | null;
        collaborationEnabled?: boolean | null;
        teamId?: string | null;
    },
) {
    const project = await prisma.project.update({
        where: { id },
        data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description ?? null } : {}),
            ...(data.collaborationEnabled !== undefined
                ? { collaborationEnabled: data.collaborationEnabled }
                : {}),
            ...(data.teamId !== undefined
                ? {
                      team: data.teamId
                          ? {
                                connect: {
                                    id: data.teamId,
                                },
                            }
                          : {
                                disconnect: true,
                            },
                  }
                : {}),
        },
        include: {
            organization: true,
            team: true,
            collaborators: true,
        },
    });
    await deleteKeys(cacheKeys.project(id));
    return project;
}

export async function archiveProject(id: string) {
    const project = await prisma.project.update({
        where: { id },
        data: {
            status: 'ARCHIVED',
            archivedAt: new Date(),
        },
    });
    await deleteKeys(cacheKeys.project(id));
    return project;
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

    const project = await prisma.project.create({
        data: createData,
        include: {
            organization: true,
            team: true,
        },
    });
    await deleteKeys(cacheKeys.project(project.id), cacheKeys.organization(project.organizationId));
    return project;
}

export async function addProjectCollaborator(data: ProjectCollaboratorPayload) {
    const collaborator = await prisma.projectCollaborator.upsert({
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
    await deleteKeys(cacheKeys.project(data.projectId), cacheKeys.user(data.userId));
    return collaborator;
}

export async function removeProjectCollaborator(projectId: string, userId: string) {
    const collaborator = await prisma.projectCollaborator.delete({
        where: {
            projectId_userId: {
                projectId,
                userId,
            },
        },
    });
    await deleteKeys(cacheKeys.project(projectId), cacheKeys.user(userId));
    return collaborator;
}
