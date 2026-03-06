import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export function requestId(req: Request, res: Response, next: NextFunction): void {
    const incomingRequestId = req.headers['x-request-id'];
    const requestIdValue =
        typeof incomingRequestId === 'string' && incomingRequestId.length > 0
            ? incomingRequestId
            : randomUUID();

    req.requestId = requestIdValue;
    res.setHeader('x-request-id', requestIdValue);
    next();
}
