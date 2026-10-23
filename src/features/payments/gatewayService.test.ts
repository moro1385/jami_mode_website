import { describe, it, expect, vi } from 'vitest';
import { createGatewayService } from './application/gatewayService';
import { createSupabaseGatewayRepository } from './infrastructure/supabaseGatewayRepository';
import { gatewayQuote, checkoutSelection, reconcileCheckoutAddress } from './domain/checkout';
import type { CartItem } from '@/features/cart/domain/cart';
import type { Address } from '@/features/account/domain/address';
const key = '71000000-0000-4000-8000-000000000001', orderId = '71000000-0000-4000-8000-000000000002';
const selection = { addressId: 'address', shippingOption: 'express', items: [{ productId: 'product', quantity: 2, size: 'M', color: null }] };
const quote = { quote: 'server-proof', total: 9000, shipping: 2000, selection: JSON.stringify(selection) };
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); }, removeItem: vi.fn((name: string) => { values.delete(name); }) };
  const post = vi.fn().mockResolvedValue({ ok: true, result: { quote: quote.quote, total: quote.total, shipping: quote.shipping } });
  const connect = vi.fn().mockResolvedValue({ post });
  return { values, storage, post, connect, service: createGatewayService({ connect }, storage, () => key) };
}
describe('gateway checkout without browser-priced orders', () => {
  it('persists the operation before a connection and requests only a quote on the first click', async () => {
    const s = setup(); s.connect.mockImplementation(async () => { expect(JSON.parse(s.values.get('trusted-checkout:owner')!).key).toBe(key); return { post: s.post }; });
    expect(await s.service.step('owner', selection, null, () => true)).toEqual({ kind: 'quote', quote });
    expect(s.post).toHaveBeenCalledExactlyOnceWith('/api/bitpay/checkout/quote', { idempotencyKey: key, selection });
  });
  it('requires a matching proof and reuses the key for order creation then safe gateway redirect', async () => {
    const s = setup(); await s.service.step('owner', selection, null, () => true);
    s.post.mockResolvedValueOnce({ ok: true, result: { orderId } }).mockResolvedValueOnce({ ok: true, result: { redirectUrl: 'https://bitpay.ir/payment/gateway-123-get' } });
    expect(await s.service.step('owner', selection, quote, () => true)).toEqual({ kind: 'redirect', url: 'https://bitpay.ir/payment/gateway-123-get' });
    expect(s.post.mock.calls[1]).toEqual(['/api/bitpay/checkout', { idempotencyKey: key, selection, quote: quote.quote }]);
    expect(s.post.mock.calls[2]).toEqual(['/api/bitpay/init', { orderId }]);
    expect(JSON.parse(s.values.get('trusted-checkout:owner')!)).toMatchObject({ key, orderId });
  });
  it('does not use a quote belonging to a different selection', async () => {
    const s = setup(); await s.service.step('owner', selection, { ...quote, selection: 'old' }, () => true);
    expect(s.post.mock.calls[0][0]).toBe('/api/bitpay/checkout/quote');
  });
  it('stops before initialization after an owner/selection change during the order request', async () => {
    const s = setup(); let current = true;
    s.post.mockImplementation(async () => { current = false; return { ok: true, result: { orderId } }; });
    expect(await s.service.step('owner', selection, quote, () => current)).toEqual({ kind: 'stale' });
    expect(s.post).toHaveBeenCalledTimes(1);
    expect(JSON.parse(s.values.get('trusted-checkout:owner')!)).not.toHaveProperty('orderId');
  });
  it('does not overwrite a newer operation or initialize the obsolete order', async () => {
    const s = setup();
    s.post.mockImplementation(async () => { s.values.set('trusted-checkout:owner', JSON.stringify({ selection: 'new', key: orderId })); return { ok: true, result: { orderId } }; });
    expect(await s.service.step('owner', selection, quote, () => true)).toEqual({ kind: 'stale' });
    expect(s.post).toHaveBeenCalledTimes(1);
    expect(JSON.parse(s.values.get('trusted-checkout:owner')!).selection).toBe('new');
  });
  it('retains an ambiguous order for tracking rather than clearing or retrying it', async () => {
    const s = setup(); s.post.mockResolvedValueOnce({ ok: true, result: { orderId } }).mockResolvedValueOnce({ ok: false, result: { code: 'PAYMENT_AMBIGUOUS' } });
    expect(await s.service.step('owner', selection, quote, () => true)).toEqual({ kind: 'ambiguous' });
    expect(s.post).toHaveBeenCalledTimes(2); expect(s.storage.removeItem).not.toHaveBeenCalled();
    expect(JSON.parse(s.values.get('trusted-checkout:owner')!).orderId).toBe(orderId);
  });
  it('clears only its own expired operation', async () => {
    const s = setup(); s.post.mockResolvedValue({ ok: false, result: { code: 'CHECKOUT_EXPIRED' } });
    expect(await s.service.step('owner', selection, null, () => true)).toEqual({ kind: 'expired' });
    expect(s.storage.removeItem).toHaveBeenCalledWith('trusted-checkout:owner');
  });
  it('rejects corrupt saved keys before making a financial request', async () => {
    const s = setup(); s.values.set('trusted-checkout:owner', JSON.stringify({ selection: JSON.stringify(selection), key: 'invalid' }));
    await expect(s.service.step('owner', selection, null, () => true)).rejects.toThrow('Invalid saved');
    expect(s.connect).not.toHaveBeenCalled();
  });
  it('blocks unsafe redirects even after an order was created', async () => {
    const s = setup(); s.post.mockResolvedValueOnce({ ok: true, result: { orderId } }).mockResolvedValueOnce({ ok: true, result: { redirectUrl: 'https://evil.invalid' } });
    await expect(s.service.step('owner', selection, quote, () => true)).rejects.toThrow('Wallet request unavailable');
    expect(JSON.parse(s.values.get('trusted-checkout:owner')!).orderId).toBe(orderId);
  });
  it('checks the fresh session owner before allowing POST', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'other' }, access_token: 'synthetic' } } });
    const send = vi.fn(); const repository = createSupabaseGatewayRepository({ auth: { getSession } } as unknown as Parameters<typeof createSupabaseGatewayRepository>[0], send);
    await expect(repository.connect('owner')).rejects.toThrow('Authentication'); expect(send).not.toHaveBeenCalled();
  });
});
describe('shared checkout contracts', () => {
  it.each([0, -1, 1.5])('refuses nonpayable server total %s', total => {
    expect(() => gatewayQuote({ quote: 'proof', total, shipping: 0 }, 'selection')).toThrow('Invalid quote');
  });
  it('does not include display prices in checkout selection', () => {
    const items = [{ productId: 'product', quantity: 2, selectedSize: 'M', selectedColor: null, price: { amount: '0.01', currencyCode: 'USD' } }] as CartItem[];
    expect(checkoutSelection('address', 'express', items)).toEqual(selection);
  });
  it('refreshes owned selected addresses and drops a foreign/deleted address', () => {
    const current = { id: 'owned', label: 'current', isDefault: true } as Address;
    expect(reconcileCheckoutAddress([current], { ...current, label: 'stale' })).toBe(current);
    expect(reconcileCheckoutAddress([current], { id: 'foreign' } as Address)).toBe(current);
    expect(reconcileCheckoutAddress([], current)).toBeNull();
  });
});
