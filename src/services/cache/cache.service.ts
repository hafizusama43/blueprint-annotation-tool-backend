import { env } from '../../config/env';
import { getRedisClient } from './redis';

export async function getOrSetJson<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = env.REDIS_DEFAULT_TTL_SECONDS,
): Promise<T> {
    const client = getRedisClient();
    if (!client) {
        return factory();
    }

    const cached = await client.get(key);
    if (cached) {
        return JSON.parse(cached) as T;
    }

    const value = await factory();
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
}

export async function setJson(
    key: string,
    value: unknown,
    ttlSeconds: number = env.REDIS_DEFAULT_TTL_SECONDS,
) {
    const client = getRedisClient();
    if (!client) {
        return;
    }

    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function deleteKeys(...keys: Array<string | undefined | null>) {
    const client = getRedisClient();
    const values = keys.filter((key): key is string => Boolean(key));
    if (!client || values.length === 0) {
        return;
    }

    await client.del(...values);
}
