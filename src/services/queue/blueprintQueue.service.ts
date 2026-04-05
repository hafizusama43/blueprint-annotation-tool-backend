import {
    DeleteMessageCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { env } from '../../config/env';
import { createError } from '../../middleware/error.middleware';
import { sqsClient } from './sqs';

export type BlueprintQueueMessage = {
    blueprintId: string;
    filePath: string;
    fileName: string;
    cleanupSourceFile?: boolean;
    kind: 'pdf' | 'image';
};

function assertQueueUrl(): string {
    if (!env.SQS_BLUEPRINT_QUEUE_URL) {
        throw createError('SQS_BLUEPRINT_QUEUE_URL is required for worker orchestration', 500);
    }

    return env.SQS_BLUEPRINT_QUEUE_URL;
}

export async function enqueueBlueprintJob(message: BlueprintQueueMessage) {
    const queueUrl = assertQueueUrl();
    await sqsClient.send(
        new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message),
        }),
    );
}

export async function receiveBlueprintJobs() {
    const queueUrl = assertQueueUrl();
    const response = await sqsClient.send(
        new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: Math.min(env.SQS_BLUEPRINT_QUEUE_BATCH_SIZE, 10),
            WaitTimeSeconds: 20,
            VisibilityTimeout: 300,
        }),
    );

    return response.Messages ?? [];
}

export async function deleteBlueprintJob(receiptHandle: string) {
    const queueUrl = assertQueueUrl();
    await sqsClient.send(
        new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
        }),
    );
}
