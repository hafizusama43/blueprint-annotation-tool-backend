import { AppGlobalRole, MembershipStatus, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { createError } from '../../middleware/error.middleware';

export async function getOrganizationRole(userId: string, organizationId: string) {
    const membership = await prisma.organizationMember.findFirst({
        where: {
            userId,
            organizationId,
            status: MembershipStatus.ACTIVE,
        },
        select: {
            role: true,
        },
    });

    return membership?.role;
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { globalRole: true },
    });

    return user?.globalRole === AppGlobalRole.SUPER_ADMIN;
}

export async function assertOrganizationRole(
    userId: string,
    organizationId: string,
    roles: UserRole[] = [UserRole.ADMIN],
) {
    if (await isSuperAdmin(userId)) {
        return;
    }

    const role = await getOrganizationRole(userId, organizationId);
    if (!(role && roles.includes(role))) {
        throw createError('You do not have access to this organization', 403);
    }
}

export async function assertProjectAccess(userId: string, projectId: string) {
    if (await isSuperAdmin(userId)) {
        return;
    }

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
            organizationId: true,
            organization: {
                select: {
                    collaborationEnabled: true,
                    personalWorkspace: true,
                    ownerId: true,
                },
            },
            collaborators: {
                where: {
                    userId,
                },
                select: {
                    id: true,
                },
            },
        },
    });

    if (!project) {
        throw createError('Project not found', 404);
    }

    const orgRole = await getOrganizationRole(userId, project.organizationId);
    if (orgRole === UserRole.ADMIN) {
        return;
    }

    if (project.organization.personalWorkspace && project.organization.ownerId === userId) {
        return;
    }

    if (project.organization.collaborationEnabled && project.collaborators.length > 0) {
        return;
    }

    throw createError('You do not have access to this project', 403);
}

export async function assertBlueprintAccess(userId: string, blueprintId: string) {
    const blueprint = await prisma.blueprint.findUnique({
        where: { id: blueprintId },
        select: {
            projectId: true,
        },
    });

    if (!blueprint?.projectId) {
        throw createError('Blueprint not found or not assigned to a project', 404);
    }

    await assertProjectAccess(userId, blueprint.projectId);
}

export async function assertBlueprintPageAccess(userId: string, blueprintPageId: string) {
    const page = await prisma.blueprintPage.findUnique({
        where: { id: blueprintPageId },
        select: {
            blueprintId: true,
        },
    });

    if (!page) {
        throw createError('Blueprint page not found', 404);
    }

    await assertBlueprintAccess(userId, page.blueprintId);
}

export async function assertShapeAccess(userId: string, shapeId: string) {
    const shape = await prisma.shape.findUnique({
        where: { id: shapeId },
        select: {
            blueprintPageId: true,
        },
    });

    if (!shape) {
        throw createError('Shape not found', 404);
    }

    await assertBlueprintPageAccess(userId, shape.blueprintPageId);
}
