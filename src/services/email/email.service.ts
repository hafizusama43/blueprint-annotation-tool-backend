import { createHmac, createHash } from 'node:crypto';
import { env } from '../../config/env';

type EmailRecipient = {
    email: string;
    name?: string;
};

export type EmailMessage = {
    to: EmailRecipient[];
    subject: string;
    text: string;
    html?: string;
};

export type EmailDeliveryResult = {
    provider: 'disabled' | 'sendgrid' | 'aws_ses';
    attempted: boolean;
    sent: boolean;
    messageId?: string | null;
    error?: string;
};

type InvitationEmailInput = {
    to: EmailRecipient;
    organizationName: string;
    teamName: string;
    inviterName?: string;
    acceptUrl: string;
};

function requireEnv(name: 'EMAIL_FROM_EMAIL' | 'SENDGRID_API_KEY' | 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY') {
    const value = env[name];
    if (!value) {
        throw new Error(`${name} is required when ${env.EMAIL_PROVIDER} email provider is enabled.`);
    }
    return value;
}

function buildFromAddress() {
    return {
        email: requireEnv('EMAIL_FROM_EMAIL'),
        name: env.EMAIL_FROM_NAME,
    };
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAddress(recipient: EmailRecipient) {
    return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;
}

function sha256(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string, encoding?: 'hex') {
    const digest = createHmac('sha256', key).update(value, 'utf8').digest();
    return encoding === 'hex' ? digest.toString('hex') : digest;
}

function getAwsSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
}

async function sendWithSendGrid(message: EmailMessage): Promise<EmailDeliveryResult> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${requireEnv('SENDGRID_API_KEY')}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            personalizations: [
                {
                    to: message.to.map((recipient) => ({
                        email: recipient.email,
                        ...(recipient.name ? { name: recipient.name } : {}),
                    })),
                },
            ],
            from: buildFromAddress(),
            subject: message.subject,
            content: [
                { type: 'text/plain', value: message.text },
                ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
            ],
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`SendGrid request failed (${response.status}): ${body}`);
    }

    return {
        provider: 'sendgrid',
        attempted: true,
        sent: true,
        messageId: response.headers.get('x-message-id'),
    };
}

async function sendWithAwsSes(message: EmailMessage): Promise<EmailDeliveryResult> {
    const region = env.AWS_REGION;
    const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
    const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');
    const sessionToken = env.AWS_SESSION_TOKEN;
    const from = buildFromAddress();
    const host = `email.${region}.amazonaws.com`;
    const path = '/v2/email/outbound-emails';
    const endpoint = `https://${host}${path}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payload = JSON.stringify({
        FromEmailAddress: formatAddress(from),
        Destination: {
            ToAddresses: message.to.map((recipient) => formatAddress(recipient)),
        },
        Content: {
            Simple: {
                Subject: {
                    Data: message.subject,
                    Charset: 'UTF-8',
                },
                Body: {
                    Text: {
                        Data: message.text,
                        Charset: 'UTF-8',
                    },
                    ...(message.html
                        ? {
                              Html: {
                                  Data: message.html,
                                  Charset: 'UTF-8',
                              },
                          }
                        : {}),
                },
            },
        },
    });
    const payloadHash = sha256(payload);
    const canonicalHeaders = [
        `content-type:application/json`,
        `host:${host}`,
        `x-amz-content-sha256:${payloadHash}`,
        `x-amz-date:${amzDate}`,
        ...(sessionToken ? [`x-amz-security-token:${sessionToken}`] : []),
    ].join('\n');
    const signedHeaders = [
        'content-type',
        'host',
        'x-amz-content-sha256',
        'x-amz-date',
        ...(sessionToken ? ['x-amz-security-token'] : []),
    ].join(';');
    const canonicalRequest = ['POST', path, '', `${canonicalHeaders}\n`, signedHeaders, payloadHash].join(
        '\n',
    );
    const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256(canonicalRequest),
    ].join('\n');
    const signingKey = getAwsSigningKey(secretAccessKey, dateStamp, region, 'ses');
    const signature = hmac(signingKey, stringToSign, 'hex');

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Host: host,
            'X-Amz-Content-Sha256': payloadHash,
            'X-Amz-Date': amzDate,
            ...(sessionToken ? { 'X-Amz-Security-Token': sessionToken } : {}),
            Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        body: payload,
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`AWS SES request failed (${response.status}): ${body}`);
    }

    const body = (await response.json()) as { MessageId?: string };
    return {
        provider: 'aws_ses',
        attempted: true,
        sent: true,
        messageId: body.MessageId ?? null,
    };
}

export async function sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    if (env.EMAIL_PROVIDER === 'disabled') {
        return {
            provider: 'disabled',
            attempted: false,
            sent: false,
        };
    }

    if (env.EMAIL_PROVIDER === 'sendgrid') {
        return sendWithSendGrid(message);
    }

    return sendWithAwsSes(message);
}

export async function sendOrganizationInvitationEmail(
    input: InvitationEmailInput,
): Promise<EmailDeliveryResult> {
    const inviterLine = input.inviterName ? `${input.inviterName} invited you` : 'You have been invited';
    const text = [
        `${inviterLine} to join ${input.organizationName}.`,
        `Assigned team: ${input.teamName}`,
        '',
        'Accept your invitation using the link below:',
        input.acceptUrl,
    ].join('\n');
    const html = [
        `<p>${escapeHtml(inviterLine)} to join <strong>${escapeHtml(input.organizationName)}</strong>.</p>`,
        `<p>Assigned team: <strong>${escapeHtml(input.teamName)}</strong></p>`,
        `<p><a href="${escapeHtml(input.acceptUrl)}">Accept your invitation</a></p>`,
    ].join('');

    try {
        return await sendEmail({
            to: [input.to],
            subject: `Invitation to join ${input.organizationName}`,
            text,
            html,
        });
    } catch (error) {
        return {
            provider: env.EMAIL_PROVIDER,
            attempted: true,
            sent: false,
            error: error instanceof Error ? error.message : 'Unknown email delivery error',
        };
    }
}
