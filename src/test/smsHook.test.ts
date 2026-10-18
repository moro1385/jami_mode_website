// @vitest-environment node
// Real signatures; synthetic credentials/OTP only. The SMS transport is always injected.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Webhook } from 'standardwebhooks';
import { createSmsHookHandler } from '../../supabase/functions/_shared/sms-hook.js';

const secret = Buffer.alloc(32, 7).toString('base64');
const otherSecret = Buffer.alloc(32, 8).toString('base64');
const payload = { user: { id: '10000000-0000-4000-8000-000000000001', phone: '+989120000000' }, sms: { otp: '001234' } };
const providerReply = (data: unknown = { RetStatus: 1 }) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
function signed(body: unknown = payload, options: { id?: string; key?: string; date?: Date; raw?: string; headers?: Record<string, string> } = {}) {
  const raw = options.raw ?? JSON.stringify(body);
  const id = options.id ?? 'msg_fixture';
  const date = options.date ?? new Date();
  return new Request('https://fixture.invalid/send-sms', { method: 'POST', body: raw, headers: {
    'content-type': 'application/json', 'webhook-id': id,
    'webhook-timestamp': String(Math.floor(date.getTime() / 1000)),
    'webhook-signature': new Webhook(options.key ?? secret).sign(id, date, raw),
    ...options.headers,
  } });
}
function fixture(options: Record<string, unknown> = {}) {
  const fetchImpl = vi.fn().mockImplementation(async () => providerReply());
  const getProviderCredentials = vi.fn(() => ({ username: 'fixture-username', password: 'fixture-password' }));
  const verifyWebhook = vi.fn((raw: string, headers: Record<string, string>, key: string) => new Webhook(key).verify(raw, headers));
  const handler = createSmsHookHandler({ fetchImpl, getProviderCredentials, verifyWebhook,
    getHookSecrets: () => 'v1,whsec_' + secret, ...options });
  return { handler, fetchImpl, getProviderCredentials, verifyWebhook };
}
afterEach(() => { vi.restoreAllMocks(); });

describe('SMS hook signature gate', () => {
  it('rejects unsigned requests even with a bearer token before reading SMS credentials', async () => {
    const f = fixture();
    const response = await f.handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify(payload),
      headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' } }));
    expect(response.status).toBe(401); expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.getProviderCredentials).not.toHaveBeenCalled();
  });
  it.each([-301000, 301000])('rejects stale/future signatures (%s ms)', async offset => {
    const f = fixture();
    expect((await f.handler(signed(payload, { date: new Date(Date.now() + offset) }))).status).toBe(401);
    expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.getProviderCredentials).not.toHaveBeenCalled();
  });
  it('rejects a valid signature from another key', async () => {
    const f = fixture();
    expect((await f.handler(signed(payload, { key: otherSecret }))).status).toBe(401);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('verifies the exact raw body rather than reserialized JSON', async () => {
    const f = fixture();
    const original = signed();
    const response = await f.handler(new Request(original.url, { method: 'POST', headers: original.headers,
      body: JSON.stringify(payload, null, 2) }));
    expect(response.status).toBe(401); expect(f.fetchImpl).not.toHaveBeenCalled();
    expect((await f.handler(signed(payload, { raw: JSON.stringify(payload, null, 2) }))).status).toBe(200);
  });
  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a tampered %s', async name => {
    const f = fixture();
    expect((await f.handler(signed(payload, { headers: { [name]: name === 'webhook-timestamp' ? String(Math.floor(Date.now() / 1000) - 1) : 'tampered' } }))).status).toBe(401);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['123abc', '1e10', '1.5', '', '-1'])('rejects malformed timestamp %s', async timestamp => {
    const f = fixture();
    expect((await f.handler(signed(payload, { headers: { 'webhook-timestamp': timestamp } }))).status).toBe(401);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'not-a-secret', 'v1,whsec_' + Buffer.alloc(8).toString('base64')])('fails closed for missing/invalid configuration', async value => {
    const f = fixture({ getHookSecrets: () => value });
    expect((await f.handler(signed())).status).toBe(503);
    expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.getProviderCredentials).not.toHaveBeenCalled();
  });
  it.each([secret, 'whsec_' + secret, 'v1,whsec_' + secret, 'v1,whsec_' + otherSecret + '|v1,whsec_' + secret])('accepts supported signing secret formats and rotation', async value => {
    const f = fixture({ getHookSecrets: () => value });
    expect((await f.handler(signed())).status).toBe(200); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('validated MeliPayamak contract', () => {
  it.each(['+989120000000', '989120000000', '09120000000'])('normalizes %s, preserves leading-zero OTP and returns no payload', async phone => {
    const f = fixture();
    const response = await f.handler(signed({ ...payload, user: { ...payload.user, phone }, injectedDestination: 'https://attacker.invalid' }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({});
    const [url, init] = f.fetchImpl.mock.calls[0];
    expect(url).toBe('https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber');
    expect(init.redirect).toBe('error');
    expect(JSON.parse(init.body)).toEqual({ username: 'fixture-username', password: 'fixture-password', text: ['001234'], to: '09120000000', bodyId: 537763 });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('accepts the signed legacy sms.code field', async () => {
    const f = fixture();
    expect((await f.handler(signed({ ...payload, sms: { code: '001234' } }))).status).toBe(200);
  });
  it.each([null, [], {}, { ...payload, user: { phone: payload.user.phone } },
    { ...payload, sms: {} }, { ...payload, sms: { otp: 123456 } }, { ...payload, sms: { otp: '12345' } },
    { ...payload, sms: { otp: '12345678901' } }, { ...payload, sms: { otp: '۱۲۳۴۵۶' } },
    { ...payload, sms: { otp: '001234', code: '999999' } }])('rejects malformed signed payload %j', async body => {
    const f = fixture();
    expect((await f.handler(signed(body))).status).toBe(400); expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.getProviderCredentials).not.toHaveBeenCalled();
  });
  it.each(['+15555555555', ' 09120000000', '0912000000', '091200000000', '0912<script>', '', '۰۹۱۲۰۰۰۰۰۰۰'])('rejects unsupported phone %s', async phone => {
    const f = fixture();
    expect((await f.handler(signed({ ...payload, user: { ...payload.user, phone } }))).status).toBe(400);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['GET', 'OPTIONS', 'PUT'])('rejects non-hook method %s', async method => {
    const f = fixture();
    expect((await f.handler(new Request('https://fixture.invalid', { method }))).status).toBe(405);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects non-JSON, oversized and malformed request bodies', async () => {
    const f = fixture();
    expect((await f.handler(signed(payload, { headers: { 'content-type': 'text/plain' } }))).status).toBe(415);
    expect((await f.handler(signed(payload, { headers: { 'content-length': '20481' } }))).status).toBe(400);
    expect((await f.handler(signed(payload, { raw: 'x'.repeat(20481) }))).status).toBe(400);
    expect((await f.handler(signed(payload, { raw: '{' }))).status).toBe(401);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('does not echo or log payloads, phone numbers, OTPs, secrets or provider errors', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const f = fixture();
    f.fetchImpl.mockRejectedValue(new Error('fixture-password 001234 09120000000 ' + secret));
    const response = await f.handler(signed());
    const text = await response.text();
    expect(response.status).toBe(500);
    for (const value of ['fixture-password', '001234', '09120000000', secret]) expect(text).not.toContain(value);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('worker-local abuse and duplicate controls', () => {
  it('shares one send across concurrent duplicates and returns a fresh success body to each caller', async () => {
    const f = fixture();
    let release: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.fetchImpl.mockImplementation(async () => { await gate; return providerReply(); });
    const first = f.handler(signed());
    const second = f.handler(signed());
    await vi.waitFor(() => expect(f.fetchImpl).toHaveBeenCalledTimes(1));
    release!();
    const responses = await Promise.all([first, second]);
    expect(await responses[0].json()).toEqual({}); expect(await responses[1].json()).toEqual({});
    expect((await f.handler(signed())).status).toBe(200);
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('rejects reuse of an event id with a different signed payload', async () => {
    const f = fixture();
    await f.handler(signed());
    expect((await f.handler(signed({ ...payload, sms: { otp: '999999' } }))).status).toBe(409);
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('throttles a new signed event for the same phone, but permits a later request', async () => {
    let time = Date.now();
    const f = fixture({ now: () => time });
    await f.handler(signed());
    const blocked = await f.handler(signed(payload, { id: 'msg_second' }));
    expect(blocked.status).toBe(429); expect(blocked.headers.get('retry-after')).toBe('30');
    time += 30001;
    expect((await f.handler(signed(payload, { id: 'msg_third' }))).status).toBe(200);
    expect(f.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('retains deduplication throughout the valid future-timestamp window', async () => {
    let time = Date.now();
    const f = fixture({ now: () => time });
    const future = new Date(time + 240000);
    await f.handler(signed(payload, { date: future }));
    time += 360000;
    expect((await f.handler(signed(payload, { date: future }))).status).toBe(200);
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('bounds cache capacity without evicting live deduplication records', async () => {
    const f = fixture({ maxEntries: 1 });
    await f.handler(signed());
    const response = await f.handler(signed({ ...payload, user: { ...payload.user, phone: '+989130000000' } }, { id: 'msg_second' }));
    expect(response.status).toBe(503); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('retains an ambiguous failure and never retries the same event automatically', async () => {
    const f = fixture({ timeoutMs: 100 });
    f.fetchImpl.mockImplementation(() => new Promise(() => {}));
    expect((await f.handler(signed())).status).toBe(500);
    expect((await f.handler(signed())).status).toBe(500);
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(f.fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe('provider failure and deadline handling', () => {
  it.each([providerReply({ RetStatus: -1, Value: 'private provider detail' }), providerReply({ RetStatus: true }),
    providerReply([]), new Response('private provider error', { status: 500 }), new Response('{'),
    new Response('x'.repeat(8193))])('rejects provider failures without exposing response bodies', async upstream => {
    const f = fixture();
    f.fetchImpl.mockResolvedValue(upstream);
    const response = await f.handler(signed());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { http_code: 500, message: 'SMS delivery could not be confirmed.' } });
  });
  it('accepts string success status used by the SMS service', async () => {
    const f = fixture(); f.fetchImpl.mockImplementation(async () => providerReply({ RetStatus: '1' }));
    expect((await f.handler(signed())).status).toBe(200);
  });
  it('bounds a stalled provider body as well as fetch', async () => {
    const f = fixture({ timeoutMs: 100 });
    f.fetchImpl.mockResolvedValue(new Response(new ReadableStream({ start() {} })));
    expect((await f.handler(signed())).status).toBe(500);
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('bounds a stalled incoming body without sending SMS', async () => {
    const f = fixture({ timeoutMs: 100 });
    const original = signed();
    const req = new Request(original.url, { method: 'POST', headers: original.headers,
      body: new ReadableStream({ start() {} }), duplex: 'half' } as RequestInit);
    expect((await f.handler(req)).status).not.toBe(200);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([{}, { username: 'fixture' }, { password: 'fixture' }])('fails closed for missing provider credentials', async credentials => {
    const f = fixture({ getProviderCredentials: () => credentials });
    expect((await f.handler(signed())).status).toBe(503); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
