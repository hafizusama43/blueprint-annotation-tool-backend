import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { AppGlobalRole, OrganizationStatus, TeamStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { R2_BUCKET, r2Client } from '../../config/r2';
import { logAdminAction } from '../../services/audit/audit.service';
import { getRedisClient } from '../../services/cache/redis';
import { sqsClient } from '../../services/queue/sqs';
import { getStripeClient } from '../../services/billing/stripe';
import * as authService from '../auth/auth.service';

type HealthState = 'healthy' | 'unhealthy' | 'disabled';

type ServiceHealthResult = {
    service: string;
    status: HealthState;
    latencyMs: number;
    checkedAt: string;
    message?: string;
    details?: Record<string, unknown>;
};

type ServiceName = 'database' | 'redis' | 'sqs' | 'r2' | 'stripe' | 'ai';

function startTimer() {
    const startedAt = Date.now();
    return {
        finish: (status: HealthState, data?: Omit<ServiceHealthResult, 'service' | 'status' | 'latencyMs' | 'checkedAt'>) => ({
            status,
            latencyMs: Date.now() - startedAt,
            checkedAt: new Date().toISOString(),
            ...data,
        }),
    };
}

async function checkDatabaseHealth(): Promise<ServiceHealthResult> {
    const timer = startTimer();
    try {
        await prisma.$queryRaw`SELECT 1`;
        return {
            service: 'database',
            ...timer.finish('healthy'),
        };
    } catch (error) {
        return {
            service: 'database',
            ...timer.finish('unhealthy', {
                message: error instanceof Error ? error.message : 'Database health check failed',
            }),
        };
    }
}

async function checkRedisHealth(): Promise<ServiceHealthResult> {
    const timer = startTimer();
    const client = getRedisClient();
    if (!client) {
        return {
            service: 'redis',
            ...timer.finish('disabled', {
                message: 'REDIS_URL is not configured',
            }),
        };
    }

    try {
        await client.connect().catch(() => undefined);
        const result = await client.ping();
        return {
            service: 'redis',
            ...timer.finish(result === 'PONG' ? 'healthy' : 'unhealthy', {
                message: `PING => ${result}`,
            }),
        };
    } catch (error) {
        return {
            service: 'redis',
            ...timer.finish('unhealthy', {
                message: error instanceof Error ? error.message : 'Redis health check failed',
            }),
        };
    }
}

async function checkSqsHealth(): Promise<ServiceHealthResult> {
    const timer = startTimer();
    if (!env.SQS_BLUEPRINT_QUEUE_URL) {
        return {
            service: 'sqs',
            ...timer.finish('disabled', {
                message: 'SQS_BLUEPRINT_QUEUE_URL is not configured',
            }),
        };
    }

    try {
        const response = await sqsClient.send(
            new GetQueueAttributesCommand({
                QueueUrl: env.SQS_BLUEPRINT_QUEUE_URL,
                AttributeNames: ['QueueArn', 'ApproximateNumberOfMessages'],
            }),
        );
        return {
            service: 'sqs',
            ...timer.finish('healthy', {
                details: {
                    queueArn: response.Attributes?.QueueArn,
                    queuedMessages: response.Attributes?.ApproximateNumberOfMessages,
                },
            }),
        };
    } catch (error) {
        return {
            service: 'sqs',
            ...timer.finish('unhealthy', {
                message: error instanceof Error ? error.message : 'SQS health check failed',
            }),
        };
    }
}

async function checkR2Health(): Promise<ServiceHealthResult> {
    const timer = startTimer();
    try {
        await r2Client.send(
            new HeadBucketCommand({
                Bucket: R2_BUCKET,
            }),
        );
        return {
            service: 'r2',
            ...timer.finish('healthy', {
                details: {
                    bucket: R2_BUCKET,
                },
            }),
        };
    } catch (error) {
        return {
            service: 'r2',
            ...timer.finish('unhealthy', {
                message: error instanceof Error ? error.message : 'R2 health check failed',
                details: {
                    bucket: R2_BUCKET,
                },
            }),
        };
    }
}

async function checkStripeHealth(): Promise<ServiceHealthResult> {
    const timer = startTimer();
    if (!env.STRIPE_SECRET_KEY) {
        return {
            service: 'stripe',
            ...timer.finish('disabled', {
                message: 'STRIPE_SECRET_KEY is not configured',
            }),
        };
    }

    try {
        const stripe = getStripeClient();
        const balance = await stripe.balance.retrieve();
        return {
            service: 'stripe',
            ...timer.finish('healthy', {
                details: {
                    availableEntries: balance.available.length,
                    pendingEntries: balance.pending.length,
                    livemode: balance.livemode,
                },
            }),
        };
    } catch (error) {
        return {
            service: 'stripe',
            ...timer.finish('unhealthy', {
                message: error instanceof Error ? error.message : 'Stripe health check failed',
            }),
        };
    }
}

async function checkAiHealth(): Promise<ServiceHealthResult> {
    const timer = startTimer();
    if (!env.AI_SERVICE_URL) {
        return {
            service: 'ai',
            ...timer.finish('disabled', {
                message: 'AI_SERVICE_URL is not configured',
            }),
        };
    }

    try {
        const baseUrl = env.AI_SERVICE_URL.replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            headers: env.AI_SERVICE_API_KEY
                ? {
                      Authorization: `Bearer ${env.AI_SERVICE_API_KEY}`,
                  }
                : undefined,
            signal: AbortSignal.timeout(5000),
        });

        return {
            service: 'ai',
            ...timer.finish(response.ok ? 'healthy' : 'unhealthy', {
                message: `HTTP ${response.status}`,
            }),
        };
    } catch (error) {
        return {
            service: 'ai',
            ...timer.finish('unhealthy', {
                message: error instanceof Error ? error.message : 'AI health check failed',
            }),
        };
    }
}

const healthCheckMap: Record<ServiceName, () => Promise<ServiceHealthResult>> = {
    database: checkDatabaseHealth,
    redis: checkRedisHealth,
    sqs: checkSqsHealth,
    r2: checkR2Health,
    stripe: checkStripeHealth,
    ai: checkAiHealth,
};

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

export async function getSystemHealth() {
    const checks = await Promise.all(Object.values(healthCheckMap).map((runCheck) => runCheck()));
    const overallStatus = checks.some((check) => check.status === 'unhealthy')
        ? 'unhealthy'
        : checks.some((check) => check.status === 'healthy')
          ? 'healthy'
          : 'disabled';

    return {
        overallStatus,
        checkedAt: new Date().toISOString(),
        services: checks,
    };
}

export async function pingSystemService(actorUserId: string, service: ServiceName) {
    const result = await healthCheckMap[service]();
    await logAdminAction({
        actorUserId,
        action: 'system_service_pinged',
        targetType: 'Service',
        targetId: service,
        metadata: {
            status: result.status,
            latencyMs: result.latencyMs,
            message: result.message,
        },
    });
    return result;
}
