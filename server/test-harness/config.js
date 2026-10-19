import { TEST_PROJECT_REF } from '../../config/supabase-public.js';
export const TEST_ORIGIN = `https://${TEST_PROJECT_REF}.supabase.co`;
export function testBackendConfig(env) {
  if (Object.entries(env).some(([key, value]) => value && (/^BITPAY_/i.test(key)
    || (/^VITE_/i.test(key) && /SECRET|SERVICE_ROLE|PASSWORD/i.test(key))))) {
    throw new Error('Payment credentials and browser secrets are forbidden in the test harness');
  }
  if (env.JAMI_TEST_SUPABASE_URL !== TEST_ORIGIN) throw new Error('Test backend project is not allowlisted');
  const publishable = env.JAMI_TEST_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.JAMI_TEST_SUPABASE_SECRET_KEY;
  if (!publishable?.startsWith('sb_publishable_') || !secret?.startsWith('sb_secret_')) {
    throw new Error('Dedicated test publishable and server secret keys are required');
  }
  return Object.freeze({ url: TEST_ORIGIN, publishable, secret, merchant: 'test:localhost-fake',
    frontendOrigin: 'http://127.0.0.1:8080', backendOrigin: 'http://127.0.0.1:3001' });
}
export const RPC_NAMES = ['trusted_checkout', 'trusted_payment_claim', 'trusted_payment_attach',
  'trusted_payment_lookup', 'trusted_payment_settle', 'trusted_verification_claim',
  'trusted_verification_record', 'trusted_reconcile_verified'];
export function guardedTestFetch(transport = globalThis.fetch, seed = false) {
  return async (input, init = {}) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw);
    const method = (init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    const allowed = (url.pathname === '/rest/v1/orders' && method === 'GET')
      || url.pathname === '/auth/v1/user'
      || RPC_NAMES.some(name => url.pathname === `/rest/v1/rpc/${name}`)
      || (seed && (url.pathname === '/auth/v1/admin/users'
        || /^\/rest\/v1\/(profiles|user_roles|addresses|categories|products|product_variants)$/.test(url.pathname)));
    if (url.origin !== TEST_ORIGIN || url.username || url.password || !allowed || init.redirect === 'follow') {
      throw new Error('Outbound test request blocked');
    }
    // Redirects cannot escape the project allowlist. Never include URLs/keys in errors.
    return transport(input, { ...init, redirect: 'error' });
  };
}
