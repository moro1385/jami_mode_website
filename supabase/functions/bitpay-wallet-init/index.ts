import { createRetiredPaymentHandler } from '../_shared/legacy-payment-bridge.js';

Deno.serve(createRetiredPaymentHandler({ wallet: true }));
