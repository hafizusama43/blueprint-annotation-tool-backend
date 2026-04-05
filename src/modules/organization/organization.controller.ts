import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
import { logAdminAction } from '../../services/audit/audit.service';
import { assertOrganizationRole, isSuperAdmin } from '../../services/permissions/permissions.service';
import * as organizationService from './organization.service';

const organizationSchema = z.object({
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional(),
    billingEmail: z.string().email().optional(),
    personalWorkspace: z.boolean().optional(),
    collaborationEnabled: z.boolean().optional(),
    ownerId: z.string().cuid().optional(),
});

const memberSchema = z.object({
    email: z.string().email(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    teamId: z.string().cuid(),
    role: z.nativeEnum(UserRole),
});

const updateOrganizationSchema = z.object({
    name: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    billingEmail: z.string().email().nullable().optional(),
    collaborationEnabled: z.boolean().optional(),
});

const updateStatusSchema = z.object({
    status: z.enum(['ACTIVE', 'TRIALING', 'SUSPENDED']),
});

export async function getOrganizations(req: Request, res: Response, next: NextFunction) {
    try {
        const organizations = await organizationService.getOrganizations(req.auth?.userId);
        res.json(organizations);
    } catch (error) {
        next(error);
    }
}

export async function getOrganizationById(req: Request, res: Response, next: NextFunction) {
    try {
        if (req.auth) {
            await assertOrganizationRole(req.auth.userId, req.params.id, [UserRole.ADMIN, UserRole.CLIENT]);
        }
        const organization = await organizationService.getOrganizationById(req.params.id);
        if (!organization) {
            return next(createError('Organization not found', 404));
        }

        res.json(organization);
    } catch (error) {
        next(error);
    }
}

export async function createOrganization(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = organizationSchema.parse(req.body);
        const organization = await organizationService.createOrganization({
            ...payload,
            ownerId: payload.ownerId ?? req.auth?.userId,
        });
        res.status(201).json(organization);
    } catch (error) {
        next(error);
    }
}

export async function addOrganizationMember(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.id, [UserRole.ADMIN]);
        const payload = memberSchema.parse(req.body);
        const invitation = await organizationService.addOrganizationMember({
            organizationId: req.params.id,
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            displayName: payload.displayName,
            teamId: payload.teamId,
            role: payload.role,
            invitedByUserId: req.auth?.userId,
        });
        await logAdminAction({
            actorUserId: req.auth.userId,
            action: 'organization_member_invited',
            targetType: 'Organization',
            targetId: req.params.id,
            metadata: {
                email: payload.email,
                teamId: payload.teamId,
                role: payload.role,
            },
        });
        res.status(201).json(invitation);
    } catch (error) {
        next(error);
    }
}

export async function updateOrganization(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.id, [UserRole.ADMIN]);
        const payload = updateOrganizationSchema.parse(req.body);
        const organization = await organizationService.updateOrganization(req.params.id, payload);
        res.json(organization);
    } catch (error) {
        next(error);
    }
}

export async function updateOrganizationStatus(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        if (!(await isSuperAdmin(req.auth.userId))) {
            return next(createError('Super admin access required', 403));
        }
        const payload = updateStatusSchema.parse(req.body);
        const organization = await organizationService.updateOrganizationStatus(
            req.params.id,
            payload.status,
        );
        await logAdminAction({
            actorUserId: req.auth.userId,
            action: 'organization_status_updated',
            targetType: 'Organization',
            targetId: req.params.id,
            metadata: payload,
        });
        res.json(organization);
    } catch (error) {
        next(error);
    }
}

export async function removeOrganizationMember(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        await assertOrganizationRole(req.auth.userId, req.params.id, [UserRole.ADMIN]);
        const membership = await organizationService.removeOrganizationMember(
            req.params.id,
            req.params.userId,
        );
        res.json(membership);
    } catch (error) {
        next(error);
    }
}
