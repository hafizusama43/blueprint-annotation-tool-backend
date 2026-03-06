import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';

export function validateBody<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            next(error);
        }
    };
}
