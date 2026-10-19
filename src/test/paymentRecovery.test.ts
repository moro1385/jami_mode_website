import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentRouter } from '../../server/bitpay-routes.js';
const rpc = vi.fn(), verify = vi.fn(), auth = vi.fn(), maybeSingle = vi.fn();
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }));
const attempt = { id: 'a', version: 2, state: 'ready', amount: 10000, currency: 'IRR', merchant: 'fixture', provider_ref: '123' };
const evidence = { amount: 10000, currency: 'IRR', merchant: 'fixture', reference: '123', transaction: '456' };
function router() { return createPaymentRouter({ admin: () => ({ rpc, from }), auth, merchant: () => 'fixture', recoveryEnabled: true,
 provider: { newPaymentsEnabled: true, verify }, legacy: { verify } }); }
async function invoke(path: string, method = 'post', body = { order_id: 'order', id_get: '123', trans_id: '456' }) {
 const target = router(); const route = target.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
 const res = { status: vi.fn(), json: vi.fn(), set: vi.fn() }; for (const f of Object.values(res)) f.mockReturnValue(res);
 await route.stack[0].handle({ body, params: { id: '10000000-0000-0000-0000-000000000001' }, headers: { authorization: 'Bearer synthetic' } }, res); return res;
}
beforeEach(() => { vi.resetAllMocks(); auth.mockResolvedValue({ id: 'customer' }); verify.mockResolvedValue(evidence);
 rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'trusted_payment_lookup' ? attempt : name === 'trusted_verification_claim' ? { state: 'verifying', claimed: true } : { success: true } })); });
describe('durable verification orchestration', () => {
 it.each(['/verify'])('claims before provider, persists evidence before settlement at %s', async path => {
  const body = path === '/verify' ? { order_id: 'order', id_get: '123', trans_id: '456' } : { topup_id: 'topup', id_get: '123', trans_id: '456' };
  const target = router(); const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); res.json.mockReturnValue(res);
  await target.stack.find(l => l.route?.path === path).route.stack[0].handle({ body },res);
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['trusted_payment_lookup','trusted_verification_claim','trusted_verification_record','trusted_payment_settle']);
  expect(res.json).toHaveBeenCalledWith({ success: true }); expect(verify).toHaveBeenCalledOnce();
 });
 it('preserves unsigned legacy callback transport without enabling its new recovery path', async () => {
  auth.mockResolvedValue(null);
  rpc.mockImplementation(async n => ({ data: n === 'trusted_payment_lookup' ? { ...attempt, version: 1 } : { success: true } }));
  expect((await invoke('/verify')).json).toHaveBeenCalledWith({ success: true });
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['trusted_payment_lookup','trusted_payment_settle']);
 });
 it('replays persisted evidence after a settlement failure without another provider verification', async () => {
  let saved = false, fail = true;
  rpc.mockImplementation(async (name: string) => {
   if (name === 'trusted_payment_lookup') return { data: attempt };
   if (name === 'trusted_verification_claim') return { data: saved ? { state: 'verified', evidence, claimed: false } : { state: 'verifying', claimed: true } };
   if (name === 'trusted_verification_record') { saved = true; return { data: { recorded: true } }; }
   if (fail) { fail = false; return { error: { message: 'database unavailable' } }; } return { data: { success: true } };
  });
  expect((await invoke('/verify')).json).toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
  expect((await invoke('/verify')).json).toHaveBeenCalledWith({ success: true }); expect(verify).toHaveBeenCalledOnce();
 });
 it('does not repeat provider verification while a prior call is ambiguous/in-flight', async () => {
  rpc.mockImplementation(async n => ({ data: n === 'trusted_payment_lookup' ? attempt : { state: 'verifying', claimed: false } }));
  expect((await invoke('/verify')).json).toHaveBeenCalledWith({ success: false, reason: 'verification_pending' }); expect(verify).not.toHaveBeenCalled();
 });
 it('never promotes status 11 or a network failure into evidence', async () => {
  verify.mockRejectedValue(new Error('PAYMENT_ALREADY_VERIFIED'));
  expect((await invoke('/verify')).json).toHaveBeenCalledWith({ success: false, reason: 'verification_pending' });
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['trusted_payment_lookup','trusted_verification_claim']);
 });
 it('refuses provider calls when the required migration is missing', async () => {
  rpc.mockImplementation(async n => n === 'trusted_payment_lookup' ? { data: attempt } : { error: { message: 'function missing' } });
  await invoke('/verify'); expect(verify).not.toHaveBeenCalled();
 });
 it('rejects corrupted stored evidence without settlement', async () => {
  rpc.mockImplementation(async n => ({ data: n === 'trusted_payment_lookup' ? attempt : { state: 'verified', evidence: { ...evidence, amount: 1 } } }));
  await invoke('/verify'); expect(rpc.mock.calls.map(c=>c[0])).toEqual(['trusted_payment_lookup','trusted_verification_claim']);
 });
});
describe('owned order status', () => {
 it('rejects anonymous reads before querying the database', async () => { auth.mockResolvedValue(null); expect((await invoke('/orders/:id/status','get')).status).toHaveBeenCalledWith(401); expect(from).not.toHaveBeenCalled(); });
 it('does not reveal a foreign order even if a mock returns it', async () => { maybeSingle.mockResolvedValue({ data: { user_id: 'other' } }); expect((await invoke('/orders/:id/status','get')).status).toHaveBeenCalledWith(404); });
 it.each([['paid','transaction',true],['pending','transaction',false],['paid',null,false]])('requires a recorded paid state and transaction %s/%s', async (state, trans, paid) => {
  maybeSingle.mockResolvedValue({ data: { id: '10000000-0000-0000-0000-000000000001', user_id: 'customer', payment_method: 'gateway', payment_state: state, payment_trans_id: trans } });
  const res = await invoke('/orders/:id/status','get'); expect(res.json).toHaveBeenCalledWith({ orderId: '10000000-0000-0000-0000-000000000001', paid }); expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
 });
});
