import 'dotenv/config';

import { randomBytes, scryptSync } from 'node:crypto';
import {
    AppGlobalRole,
    AuthProvider,
    MembershipStatus,
    OrganizationStatus,
    PrismaClient,
    TeamStatus,
    UserRole,
    UserStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'SeedPassword123!';
const PASSWORD_SCRYPT_COST = Number(process.env.PASSWORD_SCRYPT_COST || 16384);
const MEMBER_COUNT = 10;

const ORGANIZATION = {
    name: 'The Value Engineering',
    slug: 'the-value-engineering',
    description: 'Seeded organization for estimation workflows.',
    billingEmail: 'admin@valueengineering.local',
} as const;

const TEAM = {
    name: 'Estimation',
    slug: 'estimation',
    description: 'Seeded team for estimation users.',
} as const;

type SeedUserInput = {
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    globalRole: AppGlobalRole;
    organizationRole?: UserRole;
    teamRole?: UserRole;
};

const SUPER_ADMIN: SeedUserInput = {
    email: 'superadmin@valueengineering.local',
    firstName: 'Super',
    lastName: 'Admin',
    displayName: 'Super Admin',
    globalRole: AppGlobalRole.SUPER_ADMIN,
    organizationRole: UserRole.ADMIN,
    teamRole: UserRole.ADMIN,
};

const ORG_ADMIN: SeedUserInput = {
    email: 'orgadmin@valueengineering.local',
    firstName: 'Org',
    lastName: 'Admin',
    displayName: 'Org Admin',
    globalRole: AppGlobalRole.USER,
    organizationRole: UserRole.ADMIN,
    teamRole: UserRole.ADMIN,
};

function createPrisma() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL is required to run the seed.');
    }

    const pool = new Pool({
        connectionString,
    });

    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    return { prisma, pool };
}

function hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(password, salt, 64, { N: PASSWORD_SCRYPT_COST });
    return `${salt}:${derivedKey.toString('hex')}`;
}

async function upsertUser(prisma: PrismaClient, user: SeedUserInput) {
    const passwordHash = hashPassword(DEFAULT_PASSWORD);

    return prisma.user.upsert({
        where: { email: user.email },
        update: {
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            globalRole: user.globalRole,
            authProvider: AuthProvider.LOCAL,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            passwordHash,
        },
        create: {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            globalRole: user.globalRole,
            authProvider: AuthProvider.LOCAL,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            passwordHash,
        },
    });
}

async function ensureOrganizationMember(
    prisma: PrismaClient,
    organizationId: string,
    userId: string,
    role: UserRole,
    invitedByUserId?: string,
) {
    return prisma.organizationMember.upsert({
        where: {
            organizationId_userId: {
                organizationId,
                userId,
            },
        },
        update: {
            role,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: invitedByUserId || null,
        },
        create: {
            organizationId,
            userId,
            role,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: invitedByUserId || null,
        },
    });
}

async function ensureTeamMember(
    prisma: PrismaClient,
    teamId: string,
    userId: string,
    role: UserRole,
    invitedByUserId?: string,
) {
    return prisma.teamMember.upsert({
        where: {
            teamId_userId: {
                teamId,
                userId,
            },
        },
        update: {
            role,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: invitedByUserId || null,
        },
        create: {
            teamId,
            userId,
            role,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: invitedByUserId || null,
        },
    });
}

async function main() {
    const { prisma, pool } = createPrisma();

    try {
        const superAdmin = await upsertUser(prisma, SUPER_ADMIN);
        const orgAdmin = await upsertUser(prisma, ORG_ADMIN);

        const organization = await prisma.organization.upsert({
            where: { slug: ORGANIZATION.slug },
            update: {
                name: ORGANIZATION.name,
                description: ORGANIZATION.description,
                billingEmail: ORGANIZATION.billingEmail,
                personalWorkspace: false,
                collaborationEnabled: true,
                status: OrganizationStatus.ACTIVE,
                owner: {
                    connect: {
                        id: superAdmin.id,
                    },
                },
            },
            create: {
                name: ORGANIZATION.name,
                slug: ORGANIZATION.slug,
                description: ORGANIZATION.description,
                billingEmail: ORGANIZATION.billingEmail,
                personalWorkspace: false,
                collaborationEnabled: true,
                status: OrganizationStatus.ACTIVE,
                owner: {
                    connect: {
                        id: superAdmin.id,
                    },
                },
            },
        });

        await ensureOrganizationMember(
            prisma,
            organization.id,
            superAdmin.id,
            SUPER_ADMIN.organizationRole!,
            superAdmin.id,
        );
        await ensureOrganizationMember(
            prisma,
            organization.id,
            orgAdmin.id,
            ORG_ADMIN.organizationRole!,
            orgAdmin.id,
        );

        const team = await prisma.team.upsert({
            where: {
                organizationId_slug: {
                    organizationId: organization.id,
                    slug: TEAM.slug,
                },
            },
            update: {
                name: TEAM.name,
                description: TEAM.description,
                status: TeamStatus.ACTIVE,
                createdBy: {
                    connect: {
                        id: orgAdmin.id,
                    },
                },
            },
            create: {
                organizationId: organization.id,
                name: TEAM.name,
                slug: TEAM.slug,
                description: TEAM.description,
                status: TeamStatus.ACTIVE,
                createdByUserId: orgAdmin.id,
            },
        });

        await ensureTeamMember(prisma, team.id, superAdmin.id, SUPER_ADMIN.teamRole!, orgAdmin.id);
        await ensureTeamMember(prisma, team.id, orgAdmin.id, ORG_ADMIN.teamRole!, orgAdmin.id);

        const members: string[] = [];

        for (let index = 1; index <= MEMBER_COUNT; index += 1) {
            const user = await upsertUser(prisma, {
                email: `user${String(index).padStart(2, '0')}@valueengineering.local`,
                firstName: `User${index}`,
                lastName: 'Member',
                displayName: `User ${index}`,
                globalRole: AppGlobalRole.USER,
            });

            await ensureOrganizationMember(prisma, organization.id, user.id, UserRole.CLIENT, orgAdmin.id);
            await ensureTeamMember(prisma, team.id, user.id, UserRole.CLIENT, orgAdmin.id);

            members.push(user.email);
        }

        console.log('Seed completed successfully.');
        console.log(`Organization: ${organization.name} (${organization.slug})`);
        console.log(`Team: ${team.name} (${team.slug})`);
        console.log(`Default password for all seeded users: ${DEFAULT_PASSWORD}`);
        console.log(`Super admin: ${SUPER_ADMIN.email}`);
        console.log(`Org admin: ${ORG_ADMIN.email}`);
        console.log(`Org members (${members.length}): ${members.join(', ')}`);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

void main().catch((error: unknown) => {
    console.error('Seed failed.');
    console.error(error);
    process.exit(1);
});
