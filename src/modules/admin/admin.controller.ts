import { NextFunction, Request, Response } from 'express';
import { AppGlobalRole, OrganizationStatus, TeamStatus } from '@prisma/client';
import { z } from 'zod';
import * as adminService from './admin.service';

const updateUserRoleSchema = z.object({
    globalRole: z.nativeEnum(AppGlobalRole),
});

const updateOrganizationStatusSchema = z.object({
    status: z.nativeEnum(OrganizationStatus),
});

const updateTeamStatusSchema = z.object({
    status: z.nativeEnum(TeamStatus),
});

const pingServiceSchema = z.object({
    service: z.enum(['database', 'redis', 'sqs', 'r2', 'stripe', 'ai']),
});

export async function getDashboard(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.getDashboard());
    } catch (error) {
        next(error);
    }
}

export async function listUsers(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.listUsers());
    } catch (error) {
        next(error);
    }
}

export async function listOrganizations(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.listOrganizations());
    } catch (error) {
        next(error);
    }
}

export async function listTeams(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.listTeams());
    } catch (error) {
        next(error);
    }
}

export async function listProjects(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.listProjects());
    } catch (error) {
        next(error);
    }
}

export async function listSubscriptions(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.listSubscriptions());
    } catch (error) {
        next(error);
    }
}

export async function listPayments(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.listPayments());
    } catch (error) {
        next(error);
    }
}

export async function listBlueprints(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.listBlueprints());
    } catch (error) {
        next(error);
    }
}

export async function updateUserGlobalRole(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = updateUserRoleSchema.parse(req.body);
        const user = await adminService.updateUserGlobalRole(
            req.auth!.userId,
            req.params.userId,
            payload.globalRole,
        );
        res.json(user);
    } catch (error) {
        next(error);
    }
}

export async function updateOrganizationStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = updateOrganizationStatusSchema.parse(req.body);
        const organization = await adminService.updateOrganizationStatus(
            req.auth!.userId,
            req.params.organizationId,
            payload.status,
        );
        res.json(organization);
    } catch (error) {
        next(error);
    }
}

export async function updateTeamStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = updateTeamStatusSchema.parse(req.body);
        const team = await adminService.updateTeamStatus(
            req.auth!.userId,
            req.params.teamId,
            payload.status,
        );
        res.json(team);
    } catch (error) {
        next(error);
    }
}

export async function getAuditLogs(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.getAuditLogs());
    } catch (error) {
        next(error);
    }
}

export async function getSystemHealth(_req: Request, res: Response, next: NextFunction) {
    try {
        res.json(await adminService.getSystemHealth());
    } catch (error) {
        next(error);
    }
}

export async function pingSystemService(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = pingServiceSchema.parse({
            service: req.params.service,
        });
        const result = await adminService.pingSystemService(req.auth!.userId, payload.service);
        res.json(result);
    } catch (error) {
        next(error);
    }
}
