// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { createHarness } from '../../server/test-harness/app.js';
import { createFakeProvider, blockedLegacyProvider } from '../../server/test-harness/fake-provider.js';
const env = { JAMI_TEST_SUPABASE_URL: 'https://cifhcrlmjnsxpkhyloen.supabase.co',
  JAMI_TEST_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', JAMI_TEST_SUPABASE_SECRET_KEY: 'sb_secret_synthetic' };
let server;
let origin: string;
let attempt;
let paid: boolean;
let rpc;
let auth;
let transport;
async function post(path: string, body: object, headers = {}) {
  // Native HTTP permits an explicit Host header while the listener uses an
  // ephemeral port. Browser fetch implementations may overwrite Host.
  return new Promise<Response>((resolve, reject) => {
    const req = request(origin + path, { method: 'POST', headers: { Host: '127.0.0.1:3001', Origin: 'http://127.0.0.1:8080',
      'Content-Type': 'application/json', Authorization: 'Bearer synthetic-user-token', ...headers } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(new Response(data || null, { status: res.statusCode, headers: res.headers as Record<string, string> })));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
beforeEach(async () => {
  paid = false;
  attempt = { id: '00000000-0000-0000-0000-000000000001', order_id: 'synthetic-order', amount: 2020000,
    currency: 'IRR', version: 2, provider: 'bitpay', merchant: 'test:localhost-fake', state: 'creating', claimed: true };
  rpc = vi.fn(async (name, args) => {
    if (name === 'trusted_checkout') return { data: args.p_quote ? { orderId: 'synthetic-order' } : { quote: 'reviewed-quote', total: 2020000, shipping: 2000000 } };
    if (name === 'trusted_payment_claim') return { data: { ...attempt } };
    if (name === 'trusted_payment_attach') { attempt.provider_ref = args.p_ref; attempt.state = 'ready'; return { data: { ...attempt } }; }
    if (name === 'trusted_payment_lookup') return { data: { ...attempt } };
    if (name === 'trusted_payment_settle') { paid = true; attempt.state = 'settled'; attempt.transaction_id = args.p_transaction; return { data: { success: true } }; }
    throw new Error('Unexpected RPC');
  });
  auth = vi.fn().mockResolvedValue({ data: { user: { id: 'test-buyer' } }, error: null });
  transport = vi.fn(() => { throw new Error('Unexpected outbound network'); });
  const app = createHarness({ env, transport, clients: { admin: { rpc }, auth: { auth: { getUser: auth } } } });
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); expect(transport).not.toHaveBeenCalled(); });
describe('localhost fake checkout with injected Auth and RPCs', () => {
  it('quotes, creates, claims, approves locally and settles once across repeated verification', async () => {
    const body = { idempotencyKey: 'synthetic-key', selection: { items: [] } };
    expect(await (await post('/api/bitpay/checkout/quote', body)).json()).toMatchObject({ total: 2020000 });
    expect(auth).toHaveBeenCalledWith('synthetic-user-token');
    expect(rpc.mock.calls[0][1].p_user).toBe('test-buyer');
    expect(await (await post('/api/bitpay/checkout', { ...body, quote: 'reviewed-quote' })).json()).toMatchObject({ orderId: 'synthetic-order' });
    const init = await (await post('/api/bitpay/init', { orderId: 'synthetic-order' })).json();
    expect(init.redirectUrl).toMatch(/^http:\/\/127\.0\.0\.1:3001\/fake-payments\/[0-9]+$/);
    const path = new URL(init.redirectUrl).pathname;
    const premature = await (await post('/api/bitpay/verify', { order_id: 'synthetic-order', id_get: attempt.provider_ref, trans_id: '9' + attempt.provider_ref })).json();
    expect(premature.success).toBe(false); expect(paid).toBe(false);
    const completion = await post(path, { result: 'approve' });
    expect(completion.status).toBe(303);
    const callback = new URL(completion.headers.get('location')!);
    expect(callback.origin).toBe('http://127.0.0.1:8080');
    const verify = Object.fromEntries(callback.searchParams);
    expect(await (await post('/api/bitpay/verify', verify)).json()).toEqual({ success: true });
    expect(await (await post('/api/bitpay/verify', verify)).json()).toEqual({ success: true });
    expect(rpc.mock.calls.filter(([name]) => name === 'trusted_payment_settle')).toHaveLength(1);
  });
  it('cancellation does not settle an order', async () => {
    const result = await (await post('/api/bitpay/init', { orderId: 'synthetic-order' })).json();
    const completion = await post(new URL(result.redirectUrl).pathname, { result: 'cancel' });
    const callback = new URL(completion.headers.get('location')!);
    expect(await (await post('/api/bitpay/verify', Object.fromEntries(callback.searchParams))).json()).toMatchObject({ success: false, reason: 'cancelled' });
    expect(paid).toBe(false);
    expect(rpc.mock.calls.some(([name]) => name === 'trusted_payment_settle')).toBe(false);
  });
  it('does not report payment success when database settlement fails', async () => {
    const result = await (await post('/api/bitpay/init', { orderId: 'synthetic-order' })).json();
    const completion = await post(new URL(result.redirectUrl).pathname, { result: 'approve' });
    const callback = new URL(completion.headers.get('location')!);
    const previous = rpc.getMockImplementation();
    rpc.mockImplementation(async (name, args) => name === 'trusted_payment_settle'
      ? { error: { message: 'Synthetic write failure' } } : previous(name, args));
    expect(await (await post('/api/bitpay/verify', Object.fromEntries(callback.searchParams))).json()).toMatchObject({ success: false });
    expect(paid).toBe(false);
  });
  it('rejects unauthenticated checkout and forged caller identity', async () => {
    auth.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await post('/api/bitpay/checkout/quote', {})).status).toBe(401);
    expect((await post('/api/bitpay/checkout', { idempotencyKey: 'key', selection: {}, quote: 'q', userId: 'other' })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('blocks cross-origin/DNS rebinding requests before Auth or RPC', async () => {
    expect((await post('/api/bitpay/init', {}, { Origin: 'https://evil.invalid' })).status).toBe(403);
    expect((await post('/api/bitpay/init', {}, { Host: 'evil.invalid' })).status).toBe(403);
    expect(auth).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it('keeps wallet initiation disabled and legacy transport blocked', async () => {
    expect((await post('/api/bitpay/wallet-init', {})).status).toBe(503);
    await expect(blockedLegacyProvider.verify()).rejects.toThrow('blocked');
  });
  it('never verifies fake success before explicit local approval', async () => {
    const provider = createFakeProvider({ merchant: 'test:localhost-fake', backendOrigin: 'http://127.0.0.1:3001', frontendOrigin: 'http://127.0.0.1:8080' });
    const session = await provider.create(attempt);
    await expect(provider.verify({ ...attempt, state: 'ready', provider_ref: session.reference }, '9' + session.reference)).rejects.toThrow();
  });
});
