import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), stage: vi.fn(), snapshot: vi.fn(), storageEventMatches: vi.fn(),
  state: { user: { id: 'A' }, session: { userId: 'A', expiresAt: 0 } } as { user: { id: string } | null; session: { userId: string; expiresAt: number } | null },
}));
vi.mock('./cart', () => ({ accountCart: { load: mocks.load, save: mocks.save, stage: mocks.stage, snapshot: mocks.snapshot, storageEventMatches: mocks.storageEventMatches } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: Object.assign((select: (state: typeof mocks.state) => unknown) => select(mocks.state), { getState: () => mocks.state }) }));
import { useCartSync } from './presentation/useCartSync';
import { useCartStore } from '@/stores/cartStore';
import type { CartItem } from './domain/cart';
const item: CartItem = { id: 'product', productId: 'product', productTitle: 'Title', productHandle: 'handle', image: '', price: { amount: '10', currencyCode: 'IRR' }, quantity: 1, selectedSize: null, selectedColor: null };
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  mocks.state = { user: { id: 'A' }, session: { userId: 'A', expiresAt: Date.now() + 60000 } };
  mocks.stage.mockResolvedValue(undefined); mocks.snapshot.mockReturnValue(null); mocks.storageEventMatches.mockReturnValue(false);
  useCartStore.getState().resetOwner();
  mocks.load.mockResolvedValue([]); mocks.save.mockResolvedValue(undefined);
  useCartStore.getState().setItems([item]);
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });
describe('cart hook wiring to live store identity', () => {
  it('loads each new account and cannot publish the previous account late response', async () => {
    let finish!: (items: CartItem[]) => void;
    mocks.load.mockReturnValueOnce(new Promise<CartItem[]>(resolve => { finish = resolve; })).mockResolvedValueOnce([]);
    const hook = renderHook(() => useCartSync());
    mocks.state = { user: { id: 'B' }, session: { userId: 'B', expiresAt: Date.now() + 60000 } };
    useCartStore.getState().clearCart(); hook.rerender();
    await act(async () => { finish([{ ...item, quantity: 9 }]); await vi.advanceTimersByTimeAsync(600); });
    expect(mocks.load.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
    expect(useCartStore.getState().items).toEqual([]);
    expect(mocks.save.mock.calls.map(call => call.slice(0, 2))).toEqual([['B', []]]);
  });
  it('does not load or save under an expired or mismatched session', async () => {
    mocks.state.session = { userId: 'B', expiresAt: Date.now() + 60000 };
    const hook = renderHook(() => useCartSync());
    mocks.state.session = { userId: 'A', expiresAt: Date.now() - 1 }; hook.rerender();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('stops pending saves on logout and leaves local changes to the existing Auth cleanup', async () => {
    const hook = renderHook(() => useCartSync());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    mocks.state = { user: null, session: null }; hook.rerender();
    act(() => useCartStore.getState().setItems([{ ...item, quantity: 3 }]));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
