import { AppGlobalRole, OrganizationStatus, TeamStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logAdminAction } from '../../services/audit/audit.service';
import * as authService from '../auth/auth.service';

export async function getDashboard() {
    const [users, organizations, teams, projects, subscriptions, payments, blueprints] =
        await Promise.all([
            prisma.user.count(),
            prisma.organization.count(),
            prisma.team.count(),
            prisma.project.count(),
            prisma.organizationSubscription.count(),
            prisma.payment.count(),
            prisma.blueprint.count(),
        ]);

    return {
        counts: {
            users,
            organizations,
            teams,
            projects,
            subscriptions,
            payments,
            blueprints,
        },
    };
}

export async function listUsers() {
    return prisma.user.findMany({
        include: {
            organizationMemberships: {
                include: {
                    organization: true,
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function listOrganizations() {
    return prisma.organization.findMany({
        include: {
            owner: true,
            memberships: true,
            subscriptions: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function listTeams() {
    return prisma.team.findMany({
        include: {
            organization: true,
            members: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function listProjects() {
    return prisma.project.findMany({
        include: {
            organization: true,
            team: true,
            collaborators: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function listSubscriptions() {
    return prisma.organizationSubscription.findMany({
        include: {
            organization: true,
            plan: true,
            payments: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function listPayments() {
    return prisma.payment.findMany({
        include: {
            organization: true,
            organizationSubscription: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function listBlueprints() {
    return prisma.blueprint.findMany({
        include: {
            project: true,
            uploadedBy: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

export async function updateUserGlobalRole(
    actorUserId: string,
    userId: string,
    globalRole: AppGlobalRole,
) {
    const user = await authService.updateGlobalRole(userId, globalRole);
    await logAdminAction({
        actorUserId,
        action: 'user_global_role_updated',
        targetType: 'User',
        targetId: userId,
        metadata: {
            globalRole,
        },
    });
    return user;
}

export async function updateOrganizationStatus(
    actorUserId: string,
    organizationId: string,
    status: OrganizationStatus,
) {
    const organization = await prisma.organization.update({
        where: { id: organizationId },
        data: { status },
    });
    await logAdminAction({
        actorUserId,
        action: 'organization_status_updated',
        targetType: 'Organization',
        targetId: organizationId,
        metadata: {
            status,
        },
    });
    return organization;
}

export async function updateTeamStatus(actorUserId: string, teamId: string, status: TeamStatus) {
    const team = await prisma.team.update({
        where: { id: teamId },
        data: { status },
    });
    await logAdminAction({
        actorUserId,
        action: 'team_status_updated',
        targetType: 'Team',
        targetId: teamId,
        metadata: {
            status,
        },
    });
    return team;
}

export async function getAuditLogs() {
    return prisma.adminAuditLog.findMany({
        include: {
            actor: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: 200,
    });
}
