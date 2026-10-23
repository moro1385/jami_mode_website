import { describe, it, expect, vi } from 'vitest';
import { createWalletService } from './application/walletService';
import { createReceiptService } from './application/receiptService';
import { createCallbackService } from './application/callbackService';
import type { CartItem } from '@/features/cart/domain/cart';
const id = '61000000-0000-4000-8000-000000000001';
const other = '61000000-0000-4000-8000-000000000002';
const summary = { balance: 10000, currency: 'IRR', topupsEnabled: false, spendingEnabled: false, entries: [], pendingTopups: [], hasMore: false };
function setup() {
  const transport = { request: vi.fn().mockResolvedValue(summary), verify: vi.fn() };
  const storage = { getItem: vi.fn().mockReturnValue(null), removeItem: vi.fn() };
  return { transport, storage, wallet: createWalletService(transport), receipt: createReceiptService(transport, storage), callbacks: createCallbackService(transport) };
}
describe('wallet view use case validation', () => {
  it('keeps server activation flags and passes the precise cursor and AbortSignal', async () => {
    const { transport, wallet } = setup(); const signal = new AbortController().signal;
    const cursor = { id, createdAt: '2026-10-23T00:00:00.123456Z', kind: 'topup' as const, amount: 5000, balanceAfter: 10000, orderId: null, topupId: other };
    expect(await wallet.summary('owner', cursor, signal)).toEqual(summary);
    expect(transport.request.mock.calls[0][0]).toContain('beforeId=' + id);
    expect(transport.request.mock.calls[0][0]).toContain('123456Z');
    expect(transport.request.mock.calls[0].slice(1)).toEqual(['owner', undefined, signal]);
  });
  it.each([
    { balance: -1 }, { balance: 1.5 }, { currency: 'USD' }, { topupsEnabled: 'true' }, { spendingEnabled: null },
    { entries: Array.from({ length: 51 }, () => ({})) }, { pendingTopups: [{ id: 'forged', amount: 5000, createdAt: 'now' }] },
  ])('rejects malformed or untrusted financial view fields %j', async patch => {
    const { transport, wallet } = setup(); transport.request.mockResolvedValue({ ...summary, ...patch });
    await expect(wallet.summary('owner')).rejects.toThrow();
  });
});
describe('owned receipt and one-time snapshot consumption', () => {
  const items = [{ productId: 'product', quantity: 2, selectedSize: 'M', selectedColor: null }] as CartItem[];
  const raw = JSON.stringify({ orderId: id, selection: JSON.stringify({ items: [{ productId: 'product', quantity: 2, size: 'M', color: null }] }) });
  it('rejects invalid order IDs before the transport can run', async () => {
    const { receipt, transport } = setup();
    await expect(receipt.read('owner', 'forged')).rejects.toThrow('Invalid receipt');
    expect(transport.request).not.toHaveBeenCalled();
  });
  it.each([{ orderId: other, paid: true }, { orderId: id, paid: 'true' }, { orderId: id }])('rejects mismatched or non-boolean receipts %j', async result => {
    const { transport, receipt, storage } = setup(); transport.request.mockResolvedValue(result);
    await expect(receipt.read('owner', id)).rejects.toThrow('Unavailable');
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it('accepts paid only from a matching order response and passes its owner/signal', async () => {
    const { transport, receipt } = setup(); const signal = new AbortController().signal;
    transport.request.mockResolvedValue({ orderId: id, paid: true });
    expect(await receipt.read('owner', id, signal)).toEqual({ paid: true });
    expect(transport.request).toHaveBeenCalledWith('/api/bitpay/orders/' + id + '/status', 'owner', undefined, signal);
  });
  it('consumes only the matching cart snapshot and cannot consume it twice', () => {
    const { receipt, storage } = setup(); storage.getItem.mockReturnValueOnce(raw).mockReturnValueOnce(null);
    expect(receipt.consume('owner', id, items)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledWith('trusted-checkout:owner');
    expect(receipt.consume('owner', id, items)).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });
  it('preserves a newer cart and reports storage failures without consuming', () => {
    const { receipt, storage } = setup(); storage.getItem.mockReturnValue(raw);
    expect(receipt.consume('owner', id, [{ ...items[0], quantity: 3 }])).toBe(false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    storage.getItem.mockImplementation(() => { throw Error('blocked'); });
    expect(receipt.consume('owner', id, items)).toBe(false);
  });
});
describe('callback destinations remain independent of settlement evidence', () => {
  const params = { trans_id: 'synthetic', id_get: 'synthetic' };
  it('never calls verification without an order/topup identifier', async () => {
    const { callbacks, transport } = setup();
    expect(await callbacks.order(null, params)).toBe('/checkout/failed?reason=invalid');
    expect(await callbacks.wallet(null, params)).toBe('/account/wallet?topup=failed');
    expect(transport.verify).not.toHaveBeenCalled();
  });
  it('keeps an ambiguous wallet callback pending even with a success body', async () => {
    const { callbacks, transport } = setup(); transport.verify.mockResolvedValue({ ok: true, result: { success: true } });
    expect(await callbacks.wallet(id, params)).toBe('/account/wallet?topup=pending&topupId=' + id);
  });
  it('does not announce cancellation after a verification transport failure', async () => {
    const { callbacks, transport } = setup(); transport.verify.mockRejectedValue(Error('offline'));
    expect(await callbacks.wallet(id, params)).toContain('topup=pending');
    expect(await callbacks.order(id, params)).toContain('reason=error');
  });
  it('URL-encodes an untrusted failure reason instead of injecting query flags', async () => {
    const { callbacks, transport } = setup(); transport.verify.mockResolvedValue({ ok: true, result: { reason: 'cancelled&paid=true' } });
    expect(await callbacks.order(id, params)).toBe('/checkout/failed?order=' + id + '&reason=cancelled%26paid%3Dtrue');
  });
});
