import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
import * as teamService from './team.service';

const teamSchema = z.object({
    organizationId: z.string().cuid(),
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional(),
});

const teamMemberSchema = z.object({
    userId: z.string().cuid(),
    role: z.nativeEnum(UserRole),
});

export async function getTeams(req: Request, res: Response, next: NextFunction) {
    try {
        const organizationId =
            typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
        const teams = await teamService.getTeams(organizationId);
        res.json(teams);
    } catch (error) {
        next(error);
    }
}

export async function getTeamById(req: Request, res: Response, next: NextFunction) {
    try {
        const team = await teamService.getTeamById(req.params.id);
        if (!team) {
            return next(createError('Team not found', 404));
        }

        res.json(team);
    } catch (error) {
        next(error);
    }
}

export async function createTeam(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = teamSchema.parse(req.body);
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
