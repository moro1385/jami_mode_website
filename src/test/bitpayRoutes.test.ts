// Direct Express handlers with injected database/provider. No network or credentials.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentRouter } from '../../server/bitpay-routes.js';

const rpc = vi.fn();
const auth = vi.fn();
const create = vi.fn();
const verify = vi.fn();
const legacyVerify = vi.fn();
const provider = { newPaymentsEnabled: true, create, verify, redirect: (ref: string) => 'https://provider.invalid/' + ref };
const attempt = { id: 'attempt', version: 2, order_id: 'order', currency: 'IRR', amount: 20000, merchant: 'fixture', provider_ref: '123', state: 'ready' };
const verified = { currency: 'IRR', amount: 20000, merchant: 'fixture', reference: '123', transaction: 'trans' };
const router = () => createPaymentRouter({ admin: () => ({ rpc }), auth, provider, legacy: { verify: legacyVerify }, merchant: () => 'fixture' });
async function invoke(path: string, body: object = {}, target = router()) {
  const handler = target.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response); response.json.mockReturnValue(response);
  await handler({ body, headers: { authorization: 'Bearer synthetic' } }, response);
  return response;
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ id: 'customer' });
  rpc.mockImplementation(async (name: string) => ({ data: name === 'trusted_payment_lookup' ? attempt : { success: true }, error: null }));
  verify.mockResolvedValue(verified); legacyVerify.mockResolvedValue(verified);
});

describe('trusted checkout HTTP boundary', () => {
  it.each(['/init','/checkout','/checkout/quote'])('requires authenticated user at %s', async path => {
    auth.mockResolvedValue(null);
    const response = await invoke(path, { orderId: 'order', idempotencyKey: 'key', selection: {}, quote: 'hash' });
    expect(response.status).toHaveBeenCalledWith(401); expect(rpc).not.toHaveBeenCalled();
  });
  it('passes only authenticated identity and selection to one transactional routine', async () => {
    const selection = { addressId: 'address', shippingOption: 'express', items: [] };
    await invoke('/checkout', { idempotencyKey: 'key', selection, quote: 'quote' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('trusted_checkout', { p_user: 'customer', p_key: 'key', p_request: selection, p_quote: 'quote' });
  });
  it('rejects caller identity or financial arguments', async () => {
    const response = await invoke('/checkout', { idempotencyKey: 'key', selection: {}, quote: 'hash', userId: 'victim', total: 1 });
    expect(response.status).toHaveBeenCalledWith(400); expect(rpc).not.toHaveBeenCalled();
  });
  it('propagates stale/unauthorized DB rejection without creating a session', async () => {
    rpc.mockResolvedValue({ error: { message: 'stale catalog' }, data: null });
    expect((await invoke('/checkout', { idempotencyKey: 'key', selection: {}, quote: 'hash' })).status).toHaveBeenCalledWith(409);
    expect(create).not.toHaveBeenCalled();
  });
  it('disables new wallet topups without any database access', async () => {
    expect((await invoke('/wallet-init')).status).toHaveBeenCalledWith(503); expect(rpc).not.toHaveBeenCalled();
  });
  it('disables new gateway initiation without a reviewed provider contract', async () => {
    const target = createPaymentRouter({ auth, admin: () => ({ rpc }), merchant: () => 'fixture' });
    expect((await invoke('/init', { orderId: 'order' }, target)).status).toHaveBeenCalledWith(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('durable payment initiation', () => {
  it('reuses a ready attempt without another provider request', async () => {
    rpc.mockResolvedValue({ data: { ...attempt, claimed: false }, error: null });
    const response = await invoke('/init', { orderId: 'order' });
    expect(create).not.toHaveBeenCalled(); expect(response.json).toHaveBeenCalledWith({ redirectUrl: 'https://provider.invalid/123' });
  });
  it('does not retry an ambiguous creating attempt after crash or timeout', async () => {
    rpc.mockResolvedValue({ data: { ...attempt, state: 'creating', claimed: false }, error: null });
    expect((await invoke('/init', { orderId: 'order' })).status).toHaveBeenCalledWith(409); expect(create).not.toHaveBeenCalled();
  });
  it('persists a claim before the provider call and checks attachment failure', async () => {
    rpc.mockImplementation(async (name: string) => name === 'trusted_payment_claim'
      ? { data: { ...attempt, state: 'creating', claimed: true }, error: null }
      : { data: null, error: { message: 'write failed' } });
    create.mockImplementation(async () => {
      expect(rpc).toHaveBeenCalledTimes(1);
      return { currency: 'IRR', amount: 20000, merchant: 'fixture', reference: '123' };
    });
    expect((await invoke('/init', { orderId: 'order' })).status).toHaveBeenCalledWith(409);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('does not call the provider after a denied ownership claim', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'foreign order' } });
    await invoke('/init', { orderId: 'victim-order' }); expect(create).not.toHaveBeenCalled();
  });
});

describe('verified atomic settlement', () => {
  it.each([{ provider_ref: '789' }, { merchant: 'other' }, { transaction_id: 'other' }])('rejects callback/lookup binding mismatch %j before provider access', async change => {
    rpc.mockResolvedValue({ data: { ...attempt, ...change }, error: null });
    expect((await invoke('/verify', { order_id: 'order', id_get: '123', trans_id: 'trans' })).json)
      .toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
    expect(verify).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['other', '0', undefined])('does not report duplicate success for a different/missing transaction %s', async trans_id => {
    rpc.mockResolvedValue({ data: { ...attempt, state: 'settled', transaction_id: 'trans' }, error: null });
    const result = await invoke('/verify', { order_id: 'order', id_get: '123', trans_id });
    expect(result.json.mock.calls[0][0].success).toBe(false);
    expect(verify).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null,undefined,'',0,{}])('rejects malformed references %s', async id_get => {
    const response = await invoke('/verify', { order_id: 'order', id_get, trans_id: 'trans' });
    expect(response.json).toHaveBeenCalledWith({ success: false, reason: 'invalid' }); expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['/verify','/wallet-verify'])('keeps logged-out legacy returns reachable at %s', async path => {
    auth.mockResolvedValue(null);
    rpc.mockImplementation(async (name: string) => ({ data: name === 'trusted_payment_lookup' ? { ...attempt, version: 1 } : { success: true }, error: null }));
    const response = await invoke(path, { order_id: 'order', topup_id: 'topup', id_get: '123', trans_id: 'trans' });
    expect(response.json).toHaveBeenCalledWith({ success: true });
    expect(legacyVerify).toHaveBeenCalledTimes(1); expect(verify).not.toHaveBeenCalled(); expect(auth).not.toHaveBeenCalled();
  });
  it('settles v2 only using exact verified bindings', async () => {
    const response = await invoke('/verify', { order_id: 'order', id_get: '123', trans_id: 'trans' });
    expect(response.json).toHaveBeenCalledWith({ success: true });
    expect(rpc).toHaveBeenLastCalledWith('trusted_payment_settle', { p_attempt: 'attempt', p_amount: 20000, p_merchant: 'fixture', p_ref: '123', p_transaction: 'trans' });
  });
  it.each([{ amount: 20000.1 }, { amount: 19999 }, { currency: 'USD' }, { merchant: 'attacker' }, { reference: 'other' }, { transaction: 'other' }])('rejects mismatched provider evidence %j', async changed => {
    verify.mockResolvedValue({ ...verified, ...changed });
    const response = await invoke('/verify', { order_id: 'order', id_get: '123', trans_id: 'trans' });
    expect(response.json).toHaveBeenCalledWith({ success: false, reason: 'verification_pending' }); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('never returns success after a database write failure', async () => {
    rpc.mockImplementation(async (name: string) => name === 'trusted_payment_lookup' ? { data: attempt, error: null } : { data: null, error: { message: 'commit failed' } });
    expect((await invoke('/verify', { order_id: 'order', id_get: '123', trans_id: 'trans' })).json).toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
  });
  it('treats cancellation as advisory without downgrading payment', async () => {
    expect((await invoke('/verify', { order_id: 'order', id_get: '123', trans_id: '0' })).json).toHaveBeenCalledWith({ success: false, reason: 'cancelled' });
    expect(rpc).toHaveBeenCalledTimes(1); expect(verify).not.toHaveBeenCalled();
  });
  it('returns committed duplicate success without another provider request', async () => {
    rpc.mockResolvedValue({ data: { ...attempt, state: 'settled', transaction_id: 'trans' }, error: null });
    expect((await invoke('/verify', { order_id: 'order', id_get: '123', trans_id: 'trans' })).json).toHaveBeenCalledWith({ success: true });
    expect(verify).not.toHaveBeenCalled();
  });
});
