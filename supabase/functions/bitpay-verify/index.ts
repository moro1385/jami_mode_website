import { createLegacyVerificationHandler } from '../_shared/legacy-payment-bridge.js';

Deno.serve(createLegacyVerificationHandler({
  projectUrl: () => Deno.env.get('SUPABASE_URL'),
}));
