import { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { createError } from '../../middleware/error.middleware';
import { assertOrganizationRole, assertProjectAccess } from '../../services/permissions/permissions.service';
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

const updateProjectSchema = z.object({
    name: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    teamId: z.string().cuid().nullable().optional(),
    collaborationEnabled: z.boolean().nullable().optional(),
});

export async function getProjects(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const organizationId =
            typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
        const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
        if (organizationId) {
            await assertOrganizationRole(req.auth.userId, organizationId, [UserRole.ADMIN, UserRole.CLIENT]);
        }
        const projects = await projectService.getProjects(organizationId, teamId);
        res.json(projects);
    } catch (error) {
        next(error);
    }
}

export async function getProjectById(req: Request, res: Response, next: NextFunction) {
    try {
        if (req.auth) {
            await assertProjectAccess(req.auth.userId, req.params.id);
        }
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
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const payload = projectSchema.parse(req.body);
        await assertOrganizationRole(req.auth.userId, payload.organizationId, [UserRole.ADMIN]);
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
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const project = await projectService.getProjectById(req.params.id);
        if (!project) {
            return next(createError('Project not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, project.organizationId, [UserRole.ADMIN]);
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

export async function updateProject(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const project = await projectService.getProjectById(req.params.id);
        if (!project) {
            return next(createError('Project not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, project.organizationId, [UserRole.ADMIN]);
        const payload = updateProjectSchema.parse(req.body);
        const updated = await projectService.updateProject(req.params.id, payload);
        res.json(updated);
    } catch (error) {
        next(error);
    }
}

export async function archiveProject(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const project = await projectService.getProjectById(req.params.id);
        if (!project) {
            return next(createError('Project not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, project.organizationId, [UserRole.ADMIN]);
        const archived = await projectService.archiveProject(req.params.id);
        res.json(archived);
    } catch (error) {
        next(error);
    }
}

export async function removeProjectCollaborator(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth) {
            return next(createError('Authentication required', 401));
        }
        const project = await projectService.getProjectById(req.params.id);
        if (!project) {
            return next(createError('Project not found', 404));
        }
        await assertOrganizationRole(req.auth.userId, project.organizationId, [UserRole.ADMIN]);
        const removed = await projectService.removeProjectCollaborator(
            req.params.id,
            req.params.userId,
        );
        res.json(removed);
    } catch (error) {
        next(error);
    }
}
