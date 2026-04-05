import Redis from 'ioredis';
import { env } from '../../config/env';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
    if (!env.REDIS_URL) {
        return null;
    }

    if (!redisClient) {
        redisClient = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: 2,
            lazyConnect: true,
        });
    }

    return redisClient;
}
