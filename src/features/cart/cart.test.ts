import { describe, it, expect, vi } from 'vitest';
import { addCartItem, updateCartQuantity, cartSummary, parseCartItems, serializeCartItems, cartSelectionItems, type CartItem } from './domain/cart';
import { createCartService } from './application/cartService';
import { createSupabaseCartRepository } from './infrastructure/supabaseCartRepository';
const item: CartItem = { id: 'product::M::red', productId: 'product', productTitle: 'Saved title', productHandle: 'handle', image: '/image', price: { amount: '10.50', currencyCode: 'IRR' }, quantity: 2, selectedSize: 'M', selectedColor: 'red' };
describe('cart compatibility and untrusted remote data', () => {
  it('retains product/size/color identity and existing snapshot while combining quantities', () => {
    const combined = addCartItem([item], { ...item, productTitle: 'Changed', price: { amount: '99', currencyCode: 'USD' }, quantity: 3 });
    expect(combined).toEqual([{ ...item, quantity: 5 }]);
    expect(addCartItem([item], { ...item, selectedSize: 'L' })[1].id).toBe('product::L::red');
    expect(addCartItem([], { ...item, selectedSize: null, selectedColor: null })[0].id).toBe('product::none::none');
  });
  it('removes zero quantities and retains the display-total and currency fallback behavior', () => {
    expect(updateCartQuantity([item], item.id, 0)).toEqual([]);
    expect(cartSummary([item])).toEqual({ subtotal: 21, currency: 'IRR' });
    expect(cartSummary([])).toEqual({ subtotal: 0, currency: 'USD' });
    expect(item.quantity).toBe(2);
  });
  it.each([0, -1, 1.5, 101])('rejects invalid remote quantity %s', quantity => {
    expect(parseCartItems([{ ...item, quantity }])).toEqual([]);
  });
  it('retains the row limit, whole-cart malformed fallback and explicit field allowlist', () => {
    expect(parseCartItems(Array.from({ length: 101 }, () => item))).toEqual([]);
    expect(parseCartItems([item, { broken: true }])).toEqual([]);
    expect(parseCartItems([{ ...item, wallet_balance: 999 }])).toEqual([item]);
  });
  it('clones nested price snapshots and excludes extra runtime fields from writes', () => {
    const snapshot = serializeCartItems([{ ...item, wallet_balance: 99 } as CartItem]);
    expect(snapshot).toEqual([item]);
    snapshot[0].price.amount = 'changed';
    expect(item.price.amount).toBe('10.50');
  });
});
describe('cart persistence and signout flush contract', () => {
  function setup() {
    const repository = { read: vi.fn().mockResolvedValue([item]), write: vi.fn().mockResolvedValue({ error: null }) };
    const report = vi.fn();
    return { repository, report, service: createCartService(repository, () => 'fixed-time', report) };
  }
  it('rejects absent owners before querying and parses a remote cart', async () => {
    const { repository, service } = setup();
    await expect(service.load('')).rejects.toThrow('owner');
    expect(repository.read).not.toHaveBeenCalled();
    expect(await service.load('owner')).toEqual([item]);
  });
  it('captures owner, item snapshot and timestamp in a save', async () => {
    const { service, repository } = setup(); await service.save('owner', [item]);
    expect(repository.write).toHaveBeenCalledWith('owner', [item], 'fixed-time');
  });
  it('surfaces sync save errors while legacy signout flush logs resolved errors', async () => {
    const { repository, service, report } = setup(); const error = Error('denied');
    repository.write.mockResolvedValue({ error });
    await expect(service.save('owner', [item])).rejects.toThrow('denied');
    await expect(service.flush('owner', [item])).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(error);
  });
  it('retains thrown-transport rejection during legacy signout flush', async () => {
    const { repository, service } = setup(); repository.write.mockRejectedValue(Error('offline'));
    await expect(service.flush('owner', [item])).rejects.toThrow('offline');
  });
  it('keeps owner-filtered reads and the existing upsert payload', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { items: [item] }, error: null });
    const eq = vi.fn().mockReturnValue({ abortSignal: () => ({ maybeSingle }) });
    const select = vi.fn().mockReturnValue({ eq });
    const upsert = vi.fn().mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ error: null }) });
    const from = vi.fn().mockReturnValue({ select, upsert });
    const repository = createSupabaseCartRepository({ from } as unknown as Parameters<typeof createSupabaseCartRepository>[0]);
    expect(await repository.read('owner')).toEqual([item]);
    expect(eq).toHaveBeenCalledWith('user_id', 'owner');
    expect(select).toHaveBeenCalledWith('items');
    await repository.write('owner', serializeCartItems([item]), 'fixed-time');
    expect(upsert).toHaveBeenCalledWith({ user_id: 'owner', items: [item], updated_at: 'fixed-time' });
  });
});

it('never forwards a synthetic legacy variant ID or display price as inventory/payment authority', () => {
  const displayLine = { ...item, variantId: 'display-only-id' } as CartItem;
  expect(cartSelectionItems([displayLine])).toEqual([{ productId: item.productId, quantity: item.quantity, size: item.selectedSize, color: item.selectedColor }]);
  expect(serializeCartItems([displayLine])[0]).not.toHaveProperty('variantId');
});

it('orders the final signout flush after an already dispatched sync write', async () => {
 let release!: () => void; const first = new Promise<void>(r => { release = r; });
 const repository = { read: vi.fn(), write: vi.fn().mockImplementationOnce(async () => { await first; return { error: null }; }).mockResolvedValue({ error: null }) };
 const service = createCartService(repository, () => 'fixed', vi.fn());
 const syncing = service.save('A', [item]); await Promise.resolve();
 const latest = [{ ...item, quantity: 4 }]; const flushing = service.flush('A', latest); latest[0].quantity = 99;
 await Promise.resolve(); expect(repository.write).toHaveBeenCalledTimes(1);
 release(); await Promise.all([syncing, flushing]);
 expect(repository.write.mock.calls[1][1][0].quantity).toBe(4);
});
it('a rejected queued write does not block a later flush or another account', async () => {
 let reject!: (error: Error) => void; const blocked = new Promise<{ error: null }>((_, r) => { reject = r; });
 const repository = { read: vi.fn(), write: vi.fn().mockReturnValueOnce(blocked).mockResolvedValue({ error: null }) };
 const service = createCartService(repository, () => 'fixed', vi.fn());
 const first = service.save('A', [item]); const rejection = expect(first).rejects.toThrow('offline'); await Promise.resolve();
 const last = service.flush('A', []); await service.save('B', [item]);
 expect(repository.write.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
 reject(Error('offline')); await rejection; await last;
 expect(repository.write.mock.calls.map(call => call[0])).toEqual(['A', 'B', 'A']);
});

it('refuses an invalid remote cart rather than treating it as empty and uploading over it', async () => {
 const repository = { read: vi.fn().mockResolvedValue([{ ...item, quantity: 999 }]), write: vi.fn() };
 const service = createCartService(repository, () => 'fixed', vi.fn());
 await expect(service.load('A')).rejects.toThrow('Invalid remote cart'); expect(repository.write).not.toHaveBeenCalled();
});
