// @vitest-environment node
// Native Request/Response with injected transports: no Supabase or provider calls.
import { describe, expect, it, vi } from 'vitest';
import { createLegacyVerificationHandler, createRetiredPaymentHandler } from '../../supabase/functions/_shared/legacy-payment-bridge.js';
import { createPaymentRouter } from '../../server/bitpay-routes.js';

const projectUrl = () => 'https://klfmscuogsocfjxqkuib.supabase.co';
const id = '10000000-0000-4000-8000-000000000001';
const callback = { order_id: id, id_get: '12345', trans_id: '67890' };
const request = (body: unknown = callback, headers: Record<string, string> = {}) => new Request('https://edge.invalid/bitpay-verify', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('retired payment initiation', () => {
  it.each([false, true])('retires old initiation without network or configuration (wallet=%s)', async wallet => {
    const handler = createRetiredPaymentHandler({ wallet });
    const response = await handler(request({ orderId: id, amount: 1 }));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ success: false, code: wallet ? 'WALLET_TOPUPS_DISABLED' : 'LEGACY_PAYMENT_INIT_DISABLED' });
  });
  it.each(['GET', 'PUT', 'DELETE'])('rejects method %s', async method => {
    expect((await createRetiredPaymentHandler()(new Request('https://edge.invalid', { method }))).status).toBe(405);
  });
});

describe('legacy verification boundary', () => {
  it.each([false, true])('forwards only bound callback fields to the fixed trusted endpoint (wallet=%s)', async wallet => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ success: true, privateData: 'must not escape' }));
    const handler = createLegacyVerificationHandler({ wallet, projectUrl, fetchImpl });
    const body = wallet ? { topup_id: id, id_get: '12345', trans_id: '67890' } : callback;
    const response = await handler(request(body, { authorization: 'Bearer never-forward', apikey: 'never-forward' }));
    expect(await response.json()).toEqual({ success: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://jamimode.ir/api/bitpay/' + (wallet ? 'wallet-verify' : 'verify'));
    expect(options.redirect).toBe('error');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual(body);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('https://jamimode.ir');
  });
  it.each([null, [], {}, { ...callback, order_id: 'not-a-uuid' }, { ...callback, id_get: '0' },
    { ...callback, id_get: ' 12345' }, { ...callback, id_get: 'https://attacker.invalid' },
    { ...callback, trans_id: 67890 }, { ...callback, trans_id: '-1' },
    { ...callback, amount: 1 }, { ...callback, topup_id: id }, { ...callback, redirect: 'https://attacker.invalid' }])('rejects invalid input without forwarding: %j', async body => {
    const fetchImpl = vi.fn();
    const response = await createLegacyVerificationHandler({ projectUrl, fetchImpl })(request(body));
    expect(await response.json()).toEqual({ success: false, reason: 'invalid' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([null, '0'])('preserves advisory cancellation %s for the authoritative server', async trans_id => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ success: false, reason: 'cancelled' }));
    const response = await createLegacyVerificationHandler({ projectUrl, fetchImpl })(request({ ...callback, trans_id }));
    expect(await response.json()).toEqual({ success: false, reason: 'cancelled' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, () => '', () => 'https://cifhcrlmjnsxpkhyloen.supabase.co'])('does not route another project into production', async projectUrl => {
    const fetchImpl = vi.fn();
    const response = await createLegacyVerificationHandler({ projectUrl, fetchImpl })(request());
    expect(response.status).toBe(503); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('handles preflight without configuration or network', async () => {
    const fetchImpl = vi.fn();
    const response = await createLegacyVerificationHandler({ fetchImpl })(new Request('https://edge.invalid', { method: 'OPTIONS' }));
    expect(response.status).toBe(204); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects non-JSON, malformed JSON and oversized body before forwarding', async () => {
    const fetchImpl = vi.fn();
    const handler = createLegacyVerificationHandler({ projectUrl, fetchImpl });
    for (const req of [request(callback, { 'content-type': 'text/plain' }),
      request(callback, { 'content-length': '4097' }), request({ padding: 'x'.repeat(4100) }),
      new Request('https://edge.invalid', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })]) {
      expect(await (await handler(req)).json()).toEqual({ success: false, reason: 'invalid' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([reply({ success: true }, 500), reply({ success: 'true' }), reply([]),
    new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    reply({ success: true, padding: 'x'.repeat(2100) })])('fails closed for an untrusted upstream response', async upstream => {
    const fetchImpl = vi.fn().mockResolvedValue(upstream);
    const response = await createLegacyVerificationHandler({ projectUrl, fetchImpl })(request());
    expect(await response.json()).toEqual({ success: false, reason: 'verification_pending' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('redacts upstream failure details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ success: false, reason: 'sensitive internal detail' }));
    expect(await (await createLegacyVerificationHandler({ projectUrl, fetchImpl })(request())).json())
      .toEqual({ success: false, reason: 'verification_pending' });
  });
  it('does not retry a redirect/network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('private transport detail'));
    expect(await (await createLegacyVerificationHandler({ projectUrl, fetchImpl })(request())).json())
      .toEqual({ success: false, reason: 'verification_pending' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('bounds time even if the transport ignores abort', async () => {
    const fetchImpl = vi.fn((_url: string, _options: { signal: AbortSignal }) => new Promise<Response>(() => {}));
    const response = await createLegacyVerificationHandler({ projectUrl, fetchImpl, timeoutMs: 10 })(request());
    expect(await response.json()).toEqual({ success: false, reason: 'verification_pending' });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('compatibility through the existing trusted Express route', () => {
  it.each([false, true])('uses lookup + atomic settle and recognizes repeated callbacks (wallet=%s)', async wallet => {
    let settled = false;
    const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'trusted_payment_lookup'
      ? { version: 1, state: settled ? 'settled' : 'ready', provider_ref: '12345', transaction_id: settled ? '67890' : null,
        merchant: 'fixture', amount: 20000, currency: 'IRR', id: 'attempt' }
      : (settled = true, { success: true }) }));
    const verify = vi.fn(async () => ({ reference: '12345', transaction: '67890', merchant: 'fixture', amount: 20000, currency: 'IRR' }));
    const router = createPaymentRouter({ admin: () => ({ rpc }), legacy: { verify },
      provider: { newPaymentsEnabled: false }, merchant: () => 'fixture' });
    const path = wallet ? '/wallet-verify' : '/verify';
    const route = router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
    const fetchImpl = vi.fn(async (_url: string, options: { body: string }) => {
      const response = { status: vi.fn(), json: vi.fn() };
      response.status.mockReturnValue(response);
      await route({ body: JSON.parse(options.body), headers: {} }, response);
      return reply(response.json.mock.calls[0][0], response.status.mock.calls[0][0]);
    });
    const handler = createLegacyVerificationHandler({ wallet, projectUrl, fetchImpl });
    const body = wallet ? { topup_id: id, id_get: '12345', trans_id: '67890' } : callback;
    expect(await (await handler(request(body))).json()).toEqual({ success: true });
    expect(await (await handler(request(body))).json()).toEqual({ success: true });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.filter(([name]) => name === 'trusted_payment_settle')).toHaveLength(1);
    expect(rpc.mock.calls.filter(([name]) => name === 'trusted_payment_lookup')).toHaveLength(2);
  });
});
