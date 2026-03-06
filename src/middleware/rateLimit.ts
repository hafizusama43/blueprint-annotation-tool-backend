import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter
// For production, use Redis or a proper rate limiting library
interface RateLimitStore {
    [key: string]: {
        count: number;
        resetAt: number;
    };
}

const store: RateLimitStore = {};

// Clean up expired entries every 5 minutes
setInterval(
    () => {
        const now = Date.now();
        Object.keys(store).forEach((key) => {
            if (store[key].resetAt < now) {
                delete store[key];
            }
        });
    },
    5 * 60 * 1000,
);

export function rateLimit(options: { windowMs: number; maxRequests: number }) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const key = req.ip || 'unknown';
        const now = Date.now();
        const windowMs = options.windowMs;
        const maxRequests = options.maxRequests;

        // Get or create entry
        let entry = store[key];

        if (!entry || entry.resetAt < now) {
            // Create new entry or reset expired one
            entry = {
                count: 1,
                resetAt: now + windowMs,
            };
            store[key] = entry;
            return next();
        }

        // Increment count
        entry.count++;

        if (entry.count > maxRequests) {
            res.status(429).json({
                message: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil((entry.resetAt - now) / 1000),
            });
            return;
        }

        next();
    };
}
