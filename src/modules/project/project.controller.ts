import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
import * as projectService from './project.service';

const projectSchema = z.object({
    organizationId: z.string().cuid(),
    teamId: z.string().cuid().optional(),
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional(),
    collaborationEnabled: z.boolean().nullable().optional(),
});

const collaboratorSchema = z.object({
    userId: z.string().cuid(),
    role: z.nativeEnum(UserRole),
    teamId: z.string().cuid().optional(),
});

export async function getProjects(req: Request, res: Response, next: NextFunction) {
    try {
        const organizationId =
            typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
        const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
        const projects = await projectService.getProjects(organizationId, teamId);
        res.json(projects);
    } catch (error) {
        next(error);
    }
}

export async function getProjectById(req: Request, res: Response, next: NextFunction) {
    try {
        const project = await projectService.getProjectById(req.params.id);
        if (!project) {
            return next(createError('Project not found', 404));
        }

        res.json(project);
    } catch (error) {
        next(error);
    }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = projectSchema.parse(req.body);
        const project = await projectService.createProject({
            ...payload,
            createdByUserId: req.auth?.userId,
        });
        res.status(201).json(project);
    } catch (error) {
        next(error);
    }
}

export async function addProjectCollaborator(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = collaboratorSchema.parse(req.body);
        const collaborator = await projectService.addProjectCollaborator({
            projectId: req.params.id,
            userId: payload.userId,
            role: payload.role,
            teamId: payload.teamId,
            addedByUserId: req.auth?.userId,
        });
        res.status(201).json(collaborator);
    } catch (error) {
        next(error);
    }
}
