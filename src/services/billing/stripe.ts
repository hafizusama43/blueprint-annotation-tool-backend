import StripeConstructor from 'stripe';
import { env } from '../../config/env';

type StripeClient = ReturnType<typeof StripeConstructor>;

let stripeClient: StripeClient | null = null;

export function getStripeClient(): StripeClient {
    if (!env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is required for billing operations');
    }

    if (!stripeClient) {
        stripeClient = StripeConstructor(env.STRIPE_SECRET_KEY);
    }

    return stripeClient;
}
