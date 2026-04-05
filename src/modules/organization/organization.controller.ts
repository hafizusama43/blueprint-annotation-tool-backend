import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
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
    userId: z.string().cuid(),
    role: z.nativeEnum(UserRole),
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
        const payload = memberSchema.parse(req.body);
        const membership = await organizationService.addOrganizationMember({
            organizationId: req.params.id,
            userId: payload.userId,
            role: payload.role,
            invitedByUserId: req.auth?.userId,
        });
        res.status(201).json(membership);
    } catch (error) {
        next(error);
    }
}
