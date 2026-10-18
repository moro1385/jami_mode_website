import { createLegacyVerificationHandler } from '../_shared/legacy-payment-bridge.js';

Deno.serve(createLegacyVerificationHandler({
  wallet: true, projectUrl: () => Deno.env.get('SUPABASE_URL'),
}));
