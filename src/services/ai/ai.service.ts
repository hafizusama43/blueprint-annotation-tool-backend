import { env } from '../../config/env';

export async function extractPageDetails(input: {
    blueprintId: string;
    pageNumber: number;
    imageUrl: string;
    thumbnailUrl: string;
}) {
    if (!env.AI_SERVICE_URL) {
        return null;
    }

    const response = await fetch(`${env.AI_SERVICE_URL.replace(/\/$/, '')}/extract`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(env.AI_SERVICE_API_KEY ? { Authorization: `Bearer ${env.AI_SERVICE_API_KEY}` } : {}),
        },
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`AI service request failed: ${response.status} ${body}`);
    }

    return (await response.json()) as Record<string, unknown>;
}
