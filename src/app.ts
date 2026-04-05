import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import blueprintRoutes from './modules/blueprint/blueprint.routes';
import calibrationRoutes from './modules/calibration/calibration.routes';
import authRoutes from './modules/auth/auth.routes';
import organizationRoutes from './modules/organization/organization.routes';
import projectRoutes from './modules/project/project.routes';
import shapeRoutes from './modules/shape/shape.routes';
import shapePointRoutes from './modules/shapePoint/shapePoint.routes';
import subscriptionRoutes from './modules/subscription/subscription.routes';
import teamRoutes from './modules/team/team.routes';
import { env, validateEnv } from './config/env';
import { rateLimit } from './middleware/rateLimit';
import { errorHandler } from './middleware/error.middleware';
import { requestId } from './middleware/requestId';

const apiPrefix = '/api/v1';

export function createApp(): Express {
    validateEnv();

    const app = express();

    if (env.NODE_ENV === 'production') {
        app.enable('trust proxy');
    }

    const allowedOrigins = env.CORS_ORIGIN?.split(',').map((origin) => origin.trim());

    app.use(requestId);
    app.use(helmet());
    app.use(
        cors({
            origin: allowedOrigins?.length ? allowedOrigins : undefined,
            credentials: true,
        }),
    );
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: false }));
    app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
    app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'tiny'));
    app.use(rateLimit({ windowMs: 15 * 60 * 1000, maxRequests: 250 }));

    app.use(`${apiPrefix}/blueprints`, blueprintRoutes);
    app.use(`${apiPrefix}/calibrations`, calibrationRoutes);
    app.use(`${apiPrefix}/auth`, authRoutes);
    app.use(`${apiPrefix}/organizations`, organizationRoutes);
    app.use(`${apiPrefix}/projects`, projectRoutes);
    app.use(`${apiPrefix}/shapes`, shapeRoutes);
    app.use(`${apiPrefix}/shape-points`, shapePointRoutes);
    app.use(`${apiPrefix}/subscriptions`, subscriptionRoutes);
    app.use(`${apiPrefix}/teams`, teamRoutes);

    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            uptime: process.uptime(),
            env: env.NODE_ENV,
            version: env.APP_VERSION,
        });
    });

    app.get(apiPrefix, (_req, res) => {
        res.json({
            status: 'ok',
            api: 'Blueprint annotation backend',
        });
    });

    app.use(errorHandler);

    return app;
}

export default createApp();
