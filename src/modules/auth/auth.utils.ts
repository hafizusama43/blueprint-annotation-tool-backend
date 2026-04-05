import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

type TokenPayload = {
    sub: string;
    sid: string;
    type: 'access' | 'refresh';
    orgId?: string;
    role?: string;
};

function toBase64Url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64');
}

function signJwt(
    payload: TokenPayload,
    secret: string,
    expiresInSeconds: number,
): string {
    const now = Math.floor(Date.now() / 1000);
    const header = {
        alg: 'HS256',
        typ: 'JWT',
    };
    const body = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds,
    };

    const encodedHeader = toBase64Url(JSON.stringify(header));
    const encodedPayload = toBase64Url(JSON.stringify(body));
    const content = `${encodedHeader}.${encodedPayload}`;
    const signature = toBase64Url(createHmac('sha256', secret).update(content).digest());

    return `${content}.${signature}`;
}

function verifyJwt<TPayload extends TokenPayload>(token: string, secret: string): TPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const content = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', secret).update(content).digest();
    const actualSignature = fromBase64Url(encodedSignature);

    if (
        expectedSignature.length !== actualSignature.length ||
        !timingSafeEqual(expectedSignature, actualSignature)
    ) {
        throw new Error('Invalid token signature');
    }

    const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as TPayload & {
        exp?: number;
    };

    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
    }

    return payload;
}

export function hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(password, salt, 64, { N: env.PASSWORD_SCRYPT_COST });
    return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
    const [salt, storedKey] = passwordHash.split(':');
    if (!salt || !storedKey) {
        return false;
    }

    const derivedKey = scryptSync(password, salt, 64, { N: env.PASSWORD_SCRYPT_COST });
    const storedBuffer = Buffer.from(storedKey, 'hex');

    return derivedKey.length === storedBuffer.length && timingSafeEqual(derivedKey, storedBuffer);
}

export function hashRefreshToken(token: string): string {
    return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export function generateSessionToken(): string {
    return randomBytes(48).toString('hex');
}

export function createAccessToken(payload: Omit<TokenPayload, 'type'>): string {
    return signJwt(
        {
            ...payload,
            type: 'access',
        },
        env.JWT_ACCESS_SECRET,
        env.JWT_ACCESS_TTL_MINUTES * 60,
    );
}

export function createRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
    return signJwt(
        {
            ...payload,
            type: 'refresh',
        },
        env.JWT_REFRESH_SECRET,
        env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60,
    );
}

export function verifyAccessToken(token: string): TokenPayload {
    const payload = verifyJwt<TokenPayload>(token, env.JWT_ACCESS_SECRET);
    if (payload.type !== 'access') {
        throw new Error('Invalid access token');
    }
    return payload;
}

export function verifyRefreshToken(token: string): TokenPayload {
    const payload = verifyJwt<TokenPayload>(token, env.JWT_REFRESH_SECRET);
    if (payload.type !== 'refresh') {
        throw new Error('Invalid refresh token');
    }
    return payload;
}
