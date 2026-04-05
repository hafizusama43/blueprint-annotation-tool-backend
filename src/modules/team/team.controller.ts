import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
import { assertOrganizationRole } from '../../services/permissions/permissions.service';
import * as teamService from './team.service';

const teamSchema = z.object({
    organizationId: z.string().cuid(),
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const teamMemberSchema = z.object({
    userId: z.string().cuid(),
    role: z.nativeEnum(UserRole),
});

const updateTeamSchema = z.object({
    name: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export async function getTeams(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const organizationId =
            typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
        if (organizationId) {
            await assertOrganizationRole(req.auth.userId, organizationId, [UserRole.ADMIN, UserRole.CLIENT]);
        }
        const teams = await teamService.getTeams(organizationId);
        res.json(teams);
    } catch (error) {
        next(error);
    }
}

export async function getTeamById(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const team = await teamService.getTeamById(req.params.id);
        if (!team) {
            return next(createError('Team not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, team.organizationId, [UserRole.ADMIN, UserRole.CLIENT]);

        res.json(team);
    } catch (error) {
        next(error);
    }
}

export async function createTeam(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const payload = teamSchema.parse(req.body);
        await assertOrganizationRole(req.auth.userId, payload.organizationId, [UserRole.ADMIN]);
        const team = await teamService.createTeam({
            ...payload,
            createdByUserId: req.auth?.userId,
        });
        res.status(201).json(team);
    } catch (error) {
        next(error);
    }
}

export async function addTeamMember(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const team = await teamService.getTeamById(req.params.id);
        if (!team) {
            return next(createError('Team not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, team.organizationId, [UserRole.ADMIN]);
        const payload = teamMemberSchema.parse(req.body);
        const member = await teamService.addTeamMember({
            teamId: req.params.id,
            userId: payload.userId,
            role: payload.role,
            invitedByUserId: req.auth?.userId,
        });
        res.status(201).json(member);
    } catch (error) {
        next(error);
    }
}

export async function updateTeam(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const team = await teamService.getTeamById(req.params.id);
        if (!team) {
            return next(createError('Team not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, team.organizationId, [UserRole.ADMIN]);
        const payload = updateTeamSchema.parse(req.body);
        const updated = await teamService.updateTeam(req.params.id, payload);
        res.json(updated);
    } catch (error) {
        next(error);
    }
}

export async function removeTeamMember(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const team = await teamService.getTeamById(req.params.id);
        if (!team) {
            return next(createError('Team not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, team.organizationId, [UserRole.ADMIN]);
        const member = await teamService.removeTeamMember(req.params.id, req.params.userId);
        res.json(member);
    } catch (error) {
        next(error);
    }
}
