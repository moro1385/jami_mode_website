import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bitpayProvider, createBitpayProvider } from '../../server/bitpay-provider.js';
import { createPaymentRouter } from '../../server/bitpay-routes.js';

const attempt = { id: 'attempt', order_id: 'order&other=value', provider: 'bitpay',
  version: 2, state: 'ready', amount: 20000, currency: 'IRR', merchant: 'fixture-account', provider_ref: '123' };
const evidence = { amount: 20000, currency: 'IRR', merchant: 'fixture-account', reference: '123', transaction: '456' };
const syntheticKey = 'k'.repeat(52);
const wire = vi.fn();
const provider = () => createBitpayProvider({ environment: 'production', credentialEnvironment: 'production', newPaymentsEnabled: true, apiKey: syntheticKey, merchant: 'fixture-account',
  callbackOrigin: 'https://shop.invalid', fetchImpl: wire, timeoutMs: 50 });
const response = (body: unknown, ok = true) => ({ ok, text: async () => String(body), json: async () => body });
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); })); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('evidenced bitpay.ir wire protocol', () => {
  it.each([-1, -2, -3, -4, -5])('recognizes documented create rejection %s without retrying', async code => {
    wire.mockResolvedValue(response(String(code)));
    await expect(provider().create({ ...attempt, state: 'creating', claimed: true }))
      .rejects.toMatchObject({ code: `PROVIDER_CREATE_REJECTED_${-code}` });
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it.each([-1, -2, -3, -4])('recognizes documented verification rejection %s', async status => {
    wire.mockResolvedValue(response({ status, amount: 20000 }));
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ code: `PROVIDER_VERIFY_REJECTED_${-status}` });
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it('never authorizes settlement from status 11, including after status 1', async () => {
    wire.mockResolvedValueOnce(response({ status: 1, amount: 20000 }))
      .mockResolvedValueOnce(response({ status: 11, amount: 20000 }));
    expect(await provider().verify(attempt, '456')).toEqual(evidence);
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_VERIFIED' });
  });
  it.each([null, [], '1', {}, { status: '1', amount: 20000 }, { status: true }, { status: 1.1 }])('rejects malformed verification payload %j', async body => {
    wire.mockResolvedValue(response(body));
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_UNRESOLVED' });
  });
  it.each(['0', '-1', 'abc', '1.1', '1e3', '456\n', '٤٥٦', ''])('rejects undocumented transaction representation %s before transport', async transaction => {
    await expect(provider().verify(attempt, transaction)).rejects.toMatchObject({ code: 'INVALID_PROVIDER_REFERENCE' });
    expect(wire).not.toHaveBeenCalled();
  });
  it.each([{ transaction_id: '789' }, { provider_ref: '123', transaction_id: '789' }])('rejects an attempt already bound to a different transaction %j', async change => {
    await expect(provider().verify({ ...attempt, ...change }, '456')).rejects.toMatchObject({ code: 'PAYMENT_BINDING_MISMATCH' });
    expect(wire).not.toHaveBeenCalled();
  });
  it.each([{ id_get: '789' }, { trans_id: '789' }])('rejects contradictory optional echoed identifiers %j', async change => {
    wire.mockResolvedValue(response({ status: 1, amount: 20000, ...change }));
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ code: 'PAYMENT_BINDING_MISMATCH' });
  });
  it('sends a persisted optional integer factorId and verifies its documented string echo', async () => {
    wire.mockResolvedValueOnce(response('123')).mockResolvedValueOnce(response({ status: 1, amount: 20000, factorId: '42', cardNum: 'masked-card' }));
    await provider().create({ ...attempt, state: 'creating', claimed: true, factorId: 42 });
    expect(new URLSearchParams(wire.mock.calls[0][1].body).get('factorId')).toBe('42');
    expect(await provider().verify({ ...attempt, factorId: 42 }, '456')).toEqual(evidence);
  });
  it.each([undefined, '0', '43', 42, '42.0'])('rejects missing/mismatched/malformed factor echo %s when used', async factorId => {
    wire.mockResolvedValue(response({ status: 1, amount: 20000, factorId }));
    await expect(provider().verify({ ...attempt, factorId: 42 }, '456')).rejects.toThrow();
  });
  it.each(['uuid-order', '۴۲', 1.1, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid persisted factorId %s before creation', async factorId => {
    await expect(provider().create({ ...attempt, state: 'creating', claimed: true, factorId })).rejects.toMatchObject({ code: 'INVALID_FACTOR_ID' });
    expect(wire).not.toHaveBeenCalled();
  });
  it('accepts exactly 5000 rial without toman conversion', async () => {
    wire.mockResolvedValue(response('123'));
    await provider().create({ ...attempt, state: 'creating', claimed: true, amount: 5000 });
    expect(new URLSearchParams(wire.mock.calls[0][1].body).get('amount')).toBe('5000');
  });
  it('uses all three test endpoints with only test-labelled credentials and data', async () => {
    const sandbox = createBitpayProvider({ environment: 'test', credentialEnvironment: 'test', newPaymentsEnabled: true,
      apiKey: 't'.repeat(52), merchant: 'test:fixture-account', callbackOrigin: 'https://sandbox.invalid', fetchImpl: wire });
    const testAttempt = { ...attempt, merchant: 'test:fixture-account' };
    wire.mockResolvedValueOnce(response('123')).mockResolvedValueOnce(response({ status: 1, amount: 20000 }));
    await sandbox.create({ ...testAttempt, state: 'creating', claimed: true });
    expect(sandbox.redirect('123')).toBe('https://bitpay.ir/payment-test/gateway-123-get');
    await sandbox.verify(testAttempt, '456');
    expect(wire.mock.calls.map(([url]) => url)).toEqual(['https://bitpay.ir/payment-test/gateway-send', 'https://bitpay.ir/payment-test/gateway-result-second']);
  });
  it.each([['test', 'production'], ['production', 'test'], ['invalid', 'invalid'], [undefined, undefined]])('rejects ambiguous/cross-environment configuration %s/%s', (environment, credentialEnvironment) => {
    expect(() => createBitpayProvider({ environment, credentialEnvironment, fetchImpl: wire })).toThrow('INVALID_PROVIDER_ENVIRONMENT');
    expect(wire).not.toHaveBeenCalled();
  });
  it.each(['short', 'k'.repeat(53), ' ' + 'k'.repeat(51)])('rejects invalid API key format before transport', async apiKey => {
    const adapter = createBitpayProvider({ environment: 'production', credentialEnvironment: 'production', newPaymentsEnabled: true,
      apiKey, merchant: 'fixture-account', fetchImpl: wire });
    await expect(adapter.verify(attempt, '456')).rejects.toMatchObject({ code: 'INVALID_PROVIDER_KEY' });
    expect(wire).not.toHaveBeenCalled();
  });
  it('keeps the switch off by default and fails before evaluating configuration', async () => {
    const apiKey = vi.fn(() => { throw new Error('must not read credentials'); });
    const adapter = createBitpayProvider({ environment: 'production', credentialEnvironment: 'production', apiKey, fetchImpl: wire });
    expect(adapter.newPaymentsEnabled).toBe(false);
    await expect(adapter.create(attempt)).rejects.toMatchObject({ code: 'PAYMENTS_DISABLED' });
    await expect(adapter.verify(attempt, '456')).rejects.toMatchObject({ code: 'PAYMENTS_DISABLED' });
    expect(apiKey).not.toHaveBeenCalled(); expect(wire).not.toHaveBeenCalled();
  });
  it.each([['test', 'fixture-account'], ['production', 'test:fixture-account']])('rejects cross-environment durable namespaces %s/%s', async (environment, merchant) => {
    const adapter = createBitpayProvider({ environment, credentialEnvironment: environment, newPaymentsEnabled: true, apiKey: syntheticKey, merchant, fetchImpl: wire });
    await expect(adapter.verify({ ...attempt, merchant }, '456')).rejects.toMatchObject({ code: 'PAYMENT_ENVIRONMENT_MISMATCH' });
    expect(wire).not.toHaveBeenCalled();
  });
  it('creates using persisted rial terms, fixed endpoint and encoded callback', async () => {
    wire.mockResolvedValue(response('123\n'));
    expect(await provider().create({ ...attempt, state: 'creating', claimed: true })).toEqual({ amount: 20000, currency: 'IRR', merchant: 'fixture-account', reference: '123' });
    const [url, options] = wire.mock.calls[0];
    expect(url).toBe('https://bitpay.ir/payment/gateway-send');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const fields = new URLSearchParams(options.body);
    expect([...fields.keys()]).toEqual(['api', 'amount', 'redirect']);
    expect(fields.get('api')).toBe(syntheticKey); expect(fields.get('amount')).toBe('20000');
    const callback = new URL(fields.get('redirect')!);
    expect(callback.origin + callback.pathname).toBe('https://shop.invalid/checkout/verify');
    expect([...callback.searchParams]).toEqual([['order_id', attempt.order_id]]);
  });
  it('does not convert large provider reference strings into imprecise numbers', async () => {
    const ref = '999999999999999999999999'; wire.mockResolvedValue(response(ref));
    expect((await provider().create({ ...attempt, state: 'creating', claimed: true })).reference).toBe(ref);
    expect(provider().redirect(ref)).toBe(`https://bitpay.ir/payment/gateway-${ref}-get`);
  });
  it.each(['123junk', '0', '', '<html>error</html>', '12.5'])('fails closed on create response %s without interpreting undocumented codes', async body => {
    wire.mockResolvedValue(response(body));
    await expect(provider().create({ ...attempt, state: 'creating', claimed: true })).rejects.toMatchObject({ code: 'PROVIDER_CREATE_UNRESOLVED' });
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it.each([{ currency: 'USD' }, { amount: 20000.1 }, { amount: -1 }, { amount: 4999 }, { amount: Number.MAX_SAFE_INTEGER + 1 }, { merchant: 'other' }])('rejects invalid persisted terms before network %j', async change => {
    await expect(provider().create({ ...attempt, ...change, state: 'creating', claimed: true })).rejects.toThrow();
    expect(wire).not.toHaveBeenCalled();
  });
  it('requires a durable claimed creating attempt before issuing a request', async () => {
    await expect(provider().create({ ...attempt, claimed: false })).rejects.toMatchObject({ code: 'INVALID_PAYMENT_CLAIM' });
    expect(wire).not.toHaveBeenCalled();
  });
  it.each(['http://shop.invalid', 'https://user:password@shop.invalid', 'https://shop.invalid/path', 'https://shop.invalid/?x=1'])('rejects unsafe callback configuration %s', async callbackOrigin => {
    const adapter = createBitpayProvider({ environment: 'production', credentialEnvironment: 'production', newPaymentsEnabled: true, apiKey: syntheticKey, merchant: 'fixture-account', callbackOrigin, fetchImpl: wire });
    await expect(adapter.create({ ...attempt, state: 'creating', claimed: true })).rejects.toMatchObject({ code: 'INVALID_CALLBACK_ORIGIN' });
    expect(wire).not.toHaveBeenCalled();
  });
  it('uses the persisted reference and API key for verification', async () => {
    wire.mockResolvedValue(response({ status: 1, amount: '20000' }));
    expect(await provider().verify(attempt, '456')).toEqual(evidence);
    const [url, options] = wire.mock.calls[0];
    expect(url).toBe('https://bitpay.ir/payment/gateway-result-second');
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({ api: syntheticKey, trans_id: '456', id_get: '123', json: '1' });
  });
  it.each([0, 2])('does not invent success semantics for status %s', async status => {
    wire.mockResolvedValue(response({ status, amount: 20000 }));
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ code: 'PAYMENT_NOT_VERIFIED' });
  });
  it.each([19999, 20000.01, '20000.1', '2e4', null])('rejects exact amount mismatch/invalid representation %s', async amount => {
    wire.mockResolvedValue(response({ status: 1, amount }));
    await expect(provider().verify(attempt, '456')).rejects.toThrow();
  });
  it.each(['0', '../123', '123&amount=1', '123\n', ''])('rejects invalid provider refs before verification %s', async provider_ref => {
    await expect(provider().verify({ ...attempt, provider_ref }, '456')).rejects.toThrow();
    expect(wire).not.toHaveBeenCalled();
    expect(() => provider().redirect(provider_ref)).toThrow();
  });
  it('uses the documented numeric identifiers and status for legacy verification', async () => {
    const legacy = createBitpayProvider({ environment: 'production', credentialEnvironment: 'production', newPaymentsEnabled: true, apiKey: syntheticKey, merchant: 'fixture-account', fetchImpl: wire });
    wire.mockResolvedValue(response({ status: 1, amount: 20000 }));
    expect(await legacy.verifyLegacy({ ...attempt, version: 1, provider_ref: '789' }, '987'))
      .toEqual({ ...evidence, reference: '789', transaction: '987' });
  });
  it('keeps runtime new payments gated with no credentials read or network calls', async () => {
    vi.stubGlobal('fetch', wire);
    expect(bitpayProvider.newPaymentsEnabled).toBe(false);
    await expect(bitpayProvider.create({ ...attempt, state: 'creating', claimed: true })).rejects.toMatchObject({ code: 'PAYMENTS_DISABLED' });
    await expect(bitpayProvider.verify(attempt, '456')).rejects.toMatchObject({ code: 'PAYMENTS_DISABLED' });
    expect(wire).not.toHaveBeenCalled();
  });
  it('sanitizes provider/network failures and never retries', async () => {
    wire.mockRejectedValue(new Error('synthetic-key should not appear in error'));
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ message: 'PROVIDER_RESPONSE_UNRESOLVED' });
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it('rejects HTTP errors and broken JSON', async () => {
    wire.mockResolvedValueOnce(response('unavailable', false));
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ code: 'PROVIDER_HTTP_ERROR' });
    wire.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('truncated JSON'); } });
    await expect(provider().verify(attempt, '456')).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_UNRESOLVED' });
  });
  it.each(['create', 'body'])('aborts the entire %s request at deadline, including transports ignoring abort', async stage => {
    vi.useFakeTimers();
    wire.mockImplementation(() => stage === 'create' ? new Promise(() => {}) : Promise.resolve({ ok: true, text: () => new Promise(() => {}) }));
    const pending = provider().create({ ...attempt, state: 'creating', claimed: true });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(51); await rejected;
    expect(wire).toHaveBeenCalledTimes(1);
    expect(wire.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('adapter integration with the existing transactional routes (database mocked)', () => {
  // These tests prove wire/route composition. Real lock/idempotency evidence
  // remains in the separate disposable PostgreSQL suite; this is not a DB mock
  // claiming to prove concurrent SQL correctness.
  const invoke = async (router, path: string, body: object) => {
    const handler = router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
    const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); res.json.mockReturnValue(res);
    await handler({ body, headers: {} }, res); return res;
  };
  it.each([11, -1, -2, -3, -4])('never settles a ready attempt on provider status %s, even on retry', async status => {
    const rpc = vi.fn(async (_name: string) => ({ data: attempt, error: null }));
    const router = createPaymentRouter({ admin: () => ({ rpc }), provider: provider(), merchant: () => 'fixture-account' });
    wire.mockResolvedValue(response({ status, amount: 20000 }));
    const callback = { order_id: attempt.order_id, id_get: '123', trans_id: '456', status: 1, amount: 20000 };
    for (let i = 0; i < 2; i++) expect((await invoke(router, '/verify', callback)).json)
      .toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
    expect(rpc.mock.calls.every(([name]) => name === 'trusted_payment_lookup')).toBe(true);
  });
  it('keeps a failed settlement pending when the next verification returns 11', async () => {
    const rpc = vi.fn(async (name: string) => name === 'trusted_payment_lookup'
      ? { data: attempt, error: null } : { data: null, error: { message: 'commit failure' } });
    const router = createPaymentRouter({ admin: () => ({ rpc }), provider: provider(), merchant: () => 'fixture-account' });
    wire.mockResolvedValueOnce(response({ status: 1, amount: 20000 })).mockResolvedValueOnce(response({ status: 11, amount: 20000 }));
    const callback = { order_id: attempt.order_id, id_get: '123', trans_id: '456' };
    for (let i = 0; i < 2; i++) expect((await invoke(router, '/verify', callback)).json)
      .toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
    expect(rpc.mock.calls.filter(([name]) => name === 'trusted_payment_settle')).toHaveLength(1);
  });
  it('allows an explicit verification retry after a transport failure, with exact persisted bindings', async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === 'trusted_payment_lookup' ? attempt : { success: true }, error: null }));
    const router = createPaymentRouter({ admin: () => ({ rpc }), provider: provider(), merchant: () => 'fixture-account' });
    wire.mockRejectedValueOnce(new Error('transport failed')).mockResolvedValueOnce(response({ status: 1, amount: 20000 }));
    const callback = { order_id: attempt.order_id, id_get: '123', trans_id: '456', amount: 1, factorId: 'attacker', status: 1 };
    expect((await invoke(router, '/verify', callback)).json).toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
    expect(wire).toHaveBeenCalledTimes(1);
    expect((await invoke(router, '/verify', callback)).json).toHaveBeenCalledWith({ success: true });
    expect(rpc).toHaveBeenLastCalledWith('trusted_payment_settle', { p_attempt: 'attempt', p_amount: 20000, p_merchant: 'fixture-account', p_ref: '123', p_transaction: '456' });
  });
  it('handles concurrent callbacks returning 1 and 11, then reuses the committed result', async () => {
    let settled = false;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'trusted_payment_lookup') return { data: { ...attempt, state: settled ? 'settled' : 'ready', transaction_id: settled ? '456' : null }, error: null };
      if (name === 'trusted_payment_settle') { settled = true; return { data: { success: true }, error: null }; }
      throw new Error('Unexpected operation');
    });
    const router = createPaymentRouter({ admin: () => ({ rpc }), provider: provider(), merchant: () => 'fixture-account' });
    wire.mockResolvedValueOnce(response({ status: 1, amount: 20000 })).mockResolvedValueOnce(response({ status: 11, amount: 20000 }));
    const callback = { order_id: attempt.order_id, id_get: '123', trans_id: '456' };
    const results = await Promise.all([invoke(router, '/verify', callback), invoke(router, '/verify', callback)]);
    expect(results.map(res => res.json.mock.calls[0][0].success).sort()).toEqual([false, true]);
    expect((await invoke(router, '/verify', callback)).json).toHaveBeenCalledWith({ success: true });
    expect(wire).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.filter(([name]) => name === 'trusted_payment_settle')).toHaveLength(1);
  });
  it('settles once then returns duplicate callback success without another provider call or wallet credit', async () => {
    let settled = false;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'trusted_payment_lookup') return { data: { ...attempt, state: settled ? 'settled' : 'ready', transaction_id: settled ? '456' : null }, error: null };
      if (name === 'trusted_payment_settle') { settled = true; return { data: { success: true }, error: null }; }
      throw new Error('Unexpected financial operation');
    });
    const auth = vi.fn();
    const router = createPaymentRouter({ admin: () => ({ rpc }), auth, provider: provider(), merchant: () => 'fixture-account' });
    wire.mockResolvedValue(response({ status: 1, amount: 20000 }));
    const callback = { order_id: attempt.order_id, id_get: '123', trans_id: '456' };
    expect((await invoke(router, '/verify', callback)).json).toHaveBeenCalledWith({ success: true });
    expect((await invoke(router, '/verify', callback)).json).toHaveBeenCalledWith({ success: true });
    expect(wire).toHaveBeenCalledTimes(1); expect(auth).not.toHaveBeenCalled();
    expect(rpc.mock.calls.filter(([name]) => name === 'trusted_payment_settle')).toHaveLength(1);
  });
  it('leaves creation ambiguous after provider success and attachment failure, and never recreates on retry', async () => {
    let claimed = false;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'trusted_payment_claim') {
        const first = !claimed; claimed = true;
        return { data: { ...attempt, state: 'creating', claimed: first }, error: null };
      }
      if (name === 'trusted_payment_attach') return { data: null, error: { message: 'write failure' } };
      throw new Error('Unexpected financial operation');
    });
    const router = createPaymentRouter({ admin: () => ({ rpc }), auth: async () => ({ id: 'customer' }), provider: provider(), merchant: () => 'fixture-account' });
    wire.mockResolvedValue(response('123'));
    expect((await invoke(router, '/init', { orderId: attempt.order_id })).status).toHaveBeenCalledWith(409);
    expect((await invoke(router, '/init', { orderId: attempt.order_id })).json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PAYMENT_AMBIGUOUS' }));
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it('does not report paid when settlement commit fails after successful provider verification', async () => {
    const rpc = vi.fn(async (name: string) => name === 'trusted_payment_lookup'
      ? { data: attempt, error: null } : { data: null, error: { message: 'commit failure' } });
    const router = createPaymentRouter({ admin: () => ({ rpc }), provider: provider(), merchant: () => 'fixture-account' });
    wire.mockResolvedValue(response({ status: 1, amount: 20000 }));
    expect((await invoke(router, '/verify', { order_id: attempt.order_id, id_get: '123', trans_id: '456' })).json)
      .toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
  });
  it('reuses the persisted ready reference without provider creation', async () => {
    const rpc = vi.fn(async () => ({ data: { ...attempt, claimed: false }, error: null }));
    const router = createPaymentRouter({ admin: () => ({ rpc }), auth: async () => ({ id: 'customer' }), provider: provider(), merchant: () => 'fixture-account' });
    expect((await invoke(router, '/init', { orderId: attempt.order_id, amount: 1, currency: 'USD' })).json)
      .toHaveBeenCalledWith({ redirectUrl: 'https://bitpay.ir/payment/gateway-123-get' });
    expect(wire).not.toHaveBeenCalled();
  });
  it('keeps timed-out creation ambiguous and ignores client financial terms', async () => {
    vi.useFakeTimers();
    let claimed = false;
    const rpc = vi.fn(async (name: string) => {
      if (name !== 'trusted_payment_claim') throw new Error('Unexpected financial operation');
      const first = !claimed; claimed = true;
      return { data: { ...attempt, state: 'creating', claimed: first }, error: null };
    });
    wire.mockImplementation(() => new Promise(() => {}));
    const router = createPaymentRouter({ admin: () => ({ rpc }), auth: async () => ({ id: 'customer' }), provider: provider(), merchant: () => 'fixture-account' });
    const first = invoke(router, '/init', { orderId: attempt.order_id, amount: 1, currency: 'USD', merchant: 'attacker' });
    await vi.advanceTimersByTimeAsync(51);
    expect((await first).status).toHaveBeenCalledWith(409);
    expect(new URLSearchParams(wire.mock.calls[0][1].body).get('amount')).toBe('20000');
    expect((await invoke(router, '/init', { orderId: attempt.order_id })).json)
      .toHaveBeenCalledWith(expect.objectContaining({ code: 'PAYMENT_AMBIGUOUS' }));
    expect(wire).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.every(([name]) => name === 'trusted_payment_claim')).toBe(true);
  });
  it('keeps verification pending on a stalled provider without settling or changing payment state', async () => {
    vi.useFakeTimers();
    const rpc = vi.fn(async (_name: string) => ({ data: attempt, error: null }));
    wire.mockImplementation(() => new Promise(() => {}));
    const router = createPaymentRouter({ admin: () => ({ rpc }), provider: provider(), merchant: () => 'fixture-account' });
    const pending = invoke(router, '/verify', { order_id: attempt.order_id, id_get: '123', trans_id: '456' });
    await vi.advanceTimersByTimeAsync(51);
    expect((await pending).json).toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(wire.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
