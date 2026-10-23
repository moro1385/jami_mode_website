import { describe, it, expect, vi } from 'vitest';
import { createSupabasePaymentTransport } from './infrastructure/supabasePaymentTransport';
const id = '61000000-0000-4000-8000-000000000001';
function setup() {
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' }, access_token: 'synthetic' } }, error: null });
  const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ topupId: id, paid: false }) });
  const timeout = vi.fn().mockReturnValue(new AbortController().signal);
  const transport = createSupabasePaymentTransport({ auth: { getSession } } as unknown as Parameters<typeof createSupabasePaymentTransport>[0], send, timeout);
  return { getSession, send, timeout, transport };
}
describe('fresh-session payment transport', () => {
  it('rejects a different owner before sending any financial request', async () => {
    const { transport, send } = setup();
    await expect(transport.request('/api/wallet/summary', 'other')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(send).not.toHaveBeenCalled();
  });
  it('keeps no-store, fresh bearer token, POST payload and the 15-second fallback signal', async () => {
    const { transport, send, timeout } = setup();
    await transport.request('/api/bitpay/wallet-init', 'owner', { idempotencyKey: id, amount: 5000 });
    expect(send).toHaveBeenCalledWith('/api/bitpay/wallet-init', expect.objectContaining({ method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: id, amount: 5000 }) }));
    expect(timeout).toHaveBeenCalledWith(15000);
  });
  it('uses the caller signal for an owned receipt read', async () => {
    const { transport, send, timeout } = setup(); const signal = new AbortController().signal;
    await transport.request('/api/wallet/summary', 'owner', undefined, signal);
    expect(send.mock.calls[0][1]).toMatchObject({ method: 'GET', signal });
    expect(timeout).not.toHaveBeenCalled();
  });
  it.each([id, 'forged'])('preserves refusal code and accepts only a valid returned topup ID (%s)', async topupId => {
    const { transport, send } = setup(); send.mockResolvedValue({ ok: false, json: async () => ({ code: 'TOPUP_PENDING_REVIEW', topupId }) });
    await expect(transport.request('/api/bitpay/wallet-init', 'owner', {})).rejects.toMatchObject({ code: 'TOPUP_PENDING_REVIEW', topupId: topupId === id ? id : undefined });
  });
  it('uses the existing callback endpoint and body without granting local settlement', async () => {
    const { transport, send } = setup();
    await transport.verify('wallet', { topup_id: id, trans_id: 'synthetic', id_get: 'synthetic' });
    expect(send).toHaveBeenCalledWith('/api/bitpay/wallet-verify', expect.objectContaining({ method: 'POST', body: JSON.stringify({ topup_id: id, trans_id: 'synthetic', id_get: 'synthetic' }) }));
  });
});
