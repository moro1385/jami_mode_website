import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createCartSyncController } from './application/cartSyncController';
import type { CartItem } from './domain/cart';
const item: CartItem = { id: 'product', productId: 'product', productTitle: 'Title', productHandle: 'handle', image: '', price: { amount: '10', currencyCode: 'IRR' }, quantity: 1, selectedSize: null, selectedColor: null };
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const stops: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.clearAllTimers(); vi.useRealTimers(); });
function setup() {
  let items = [{ ...item, price: { ...item.price } }]; let current = true;
  const listeners = new Set<() => void>();
  const change = (next: CartItem[]) => { items = next; listeners.forEach(listener => listener()); };
  const initial = deferred<CartItem[]>();
  const load = vi.fn().mockReturnValue(initial.promise), save = vi.fn().mockResolvedValue(undefined), reportError = vi.fn();
  const replaceItems = vi.fn(change);
  const controller = createCartSyncController('owner-A', {
    load, save, getItems: () => items, replaceItems,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isCurrent: () => current,
    delay: (task, time) => { const id = setTimeout(task, time); return () => clearTimeout(id); }, reportError,
  });
  stops.push(controller.stop); controller.start();
  return { controller, initial, save, load, reportError, replaceItems, change, getItems: () => items, leave: () => { current = false; }, listenerCount: () => listeners.size };
}
describe('owner-scoped cart synchronization', () => {
  it('keeps nonempty server precedence and saves after the debounce interval', async () => {
    const s = setup(); s.initial.resolve([{ ...item, quantity: 4 }]);
    await vi.advanceTimersByTimeAsync(599); expect(s.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.getItems()[0].quantity).toBe(4);
    expect(s.save).toHaveBeenCalledWith('owner-A', [{ ...item, quantity: 4 }]);
  });
  it('preserves a local guest cart when the remote cart is empty', async () => {
    const s = setup(); s.initial.resolve([]); await vi.advanceTimersByTimeAsync(600);
    expect(s.replaceItems).not.toHaveBeenCalled(); expect(s.save).toHaveBeenCalledWith('owner-A', [item]);
  });
  it('does not lose the pending save when initial loading takes longer than debounce', async () => {
    const s = setup(); await vi.advanceTimersByTimeAsync(4000); expect(s.save).not.toHaveBeenCalled();
    s.initial.resolve([]); await vi.advanceTimersByTimeAsync(600); expect(s.save).toHaveBeenCalledTimes(1);
  });
  it('does not erase local edits made while the initial read was pending', async () => {
    const s = setup(); s.change([{ ...item, quantity: 3 }]); s.initial.resolve([{ ...item, quantity: 8 }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(s.replaceItems).not.toHaveBeenCalled(); expect(s.save).toHaveBeenCalledWith('owner-A', [{ ...item, quantity: 3 }]);
  });
  it('ignores a stopped owner read and cleans the subscription', async () => {
    const s = setup(); s.controller.stop(); s.initial.resolve([{ ...item, quantity: 9 }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.listenerCount()).toBe(0); expect(s.replaceItems).not.toHaveBeenCalled(); expect(s.save).not.toHaveBeenCalled();
  });
  it('rechecks the active account before applying a read or dispatching a delayed write', async () => {
    const reading = setup(); reading.leave(); reading.initial.resolve([{ ...item, quantity: 9 }]);
    await vi.advanceTimersByTimeAsync(1000); expect(reading.replaceItems).not.toHaveBeenCalled();
    const saving = setup(); saving.initial.resolve([]); await vi.advanceTimersByTimeAsync(0); saving.leave();
    await vi.advanceTimersByTimeAsync(600); expect(saving.save).not.toHaveBeenCalled();
  });
  it('cancels queued writes when stopped', async () => {
    const s = setup(); s.initial.resolve([]); await vi.advanceTimersByTimeAsync(0); s.controller.stop();
    await vi.advanceTimersByTimeAsync(600); expect(s.save).not.toHaveBeenCalled();
  });
  it('serializes saves and submits newer edits after the in-flight save completes', async () => {
    const s = setup(); const first = deferred<void>(); s.save.mockReturnValueOnce(first.promise);
    s.initial.resolve([]); await vi.advanceTimersByTimeAsync(600); expect(s.save).toHaveBeenCalledTimes(1);
    s.change([{ ...item, quantity: 3 }]); await vi.advanceTimersByTimeAsync(600); expect(s.save).toHaveBeenCalledTimes(1);
    first.resolve(); await vi.advanceTimersByTimeAsync(600);
    expect(s.save).toHaveBeenCalledTimes(2); expect(s.save.mock.calls[1]).toEqual(['owner-A', [{ ...item, quantity: 3 }]]);
  });
  it('does not upload over an unknown cart after an initial read error', async () => {
    const s = setup(); s.initial.reject(Error('offline')); await vi.advanceTimersByTimeAsync(0);
    s.change([{ ...item, quantity: 3 }]); await vi.advanceTimersByTimeAsync(5000);
    expect(s.reportError).toHaveBeenCalled(); expect(s.save).not.toHaveBeenCalled();
  });
  it('does not loop on a failed save and retries after a newer edit', async () => {
    const s = setup(); s.save.mockRejectedValueOnce(Error('offline')); s.initial.resolve([]);
    await vi.advanceTimersByTimeAsync(5000); expect(s.save).toHaveBeenCalledTimes(1);
    s.change([{ ...item, quantity: 3 }]); await vi.advanceTimersByTimeAsync(600); expect(s.save).toHaveBeenCalledTimes(2);
  });
});

it('retries a failed initial read only on an explicit action and preserves intervening local edits', async () => {
 const s = setup(); s.initial.reject(Error('offline')); await vi.advanceTimersByTimeAsync(0);
 s.change([{ ...item, quantity: 3 }]); await vi.advanceTimersByTimeAsync(5000); expect(s.load).toHaveBeenCalledTimes(1);
 s.load.mockResolvedValueOnce([{ ...item, quantity: 9 }]); s.controller.retry(); await vi.advanceTimersByTimeAsync(600);
 expect(s.getItems()[0].quantity).toBe(3); expect(s.save).toHaveBeenCalledWith('owner-A', [{ ...item, quantity: 3 }]);
});
it('can retry a dirty failed write without requiring another shopper edit', async () => {
 const s = setup(); s.save.mockRejectedValueOnce(Error('offline')); s.initial.resolve([]); await vi.advanceTimersByTimeAsync(5000);
 expect(s.save).toHaveBeenCalledTimes(1); s.controller.retry(); await vi.advanceTimersByTimeAsync(600); expect(s.save).toHaveBeenCalledTimes(2);
});
it('reconciles another tab without echoing it as a new local edit', async () => {
 const s = setup(); s.initial.resolve([]); await vi.advanceTimersByTimeAsync(600); s.save.mockClear();
 s.controller.acceptExternal([{ ...item, quantity: 4 }], false); await vi.advanceTimersByTimeAsync(1000);
 expect(s.getItems()[0].quantity).toBe(4); expect(s.save).not.toHaveBeenCalled();
 s.controller.acceptExternal([], true); await vi.advanceTimersByTimeAsync(600); expect(s.save).toHaveBeenCalledWith('owner-A', []);
});
