import { env } from './config/env';
import { pollBlueprintQueueOnce } from './modules/blueprint/blueprint.processor';

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    while (true) {
        try {
            const processed = await pollBlueprintQueueOnce();
            if (processed === 0) {
                await sleep(env.WORKER_POLL_INTERVAL_MS);
            }
        } catch (error) {
            console.error('Worker loop failed', error);
            await sleep(env.WORKER_POLL_INTERVAL_MS);
        }
    }
}

void main();
