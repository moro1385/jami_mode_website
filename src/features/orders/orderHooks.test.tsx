import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ listAccount: vi.fn(), details: vi.fn() }));
vi.mock('./orders', () => ({ ordersService: mocks }));
import { useAccountOrders } from './presentation/useAccountOrders';
import { useOrderDetails } from './presentation/useOrderDetails';
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const detail = (id: string) => ({ order: { id }, items: [{ id: id + '-item' }] });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe('order presentation lifetimes', () => {
  it('hides loaded previous-owner orders while the new owner is loading and on logout', async () => {
    const pending = deferred<unknown[]>();
    mocks.listAccount.mockResolvedValueOnce([{ id: 'first' }]).mockReturnValueOnce(pending.promise);
    const hook = renderHook(({ user }) => useAccountOrders(user), { initialProps: { user: 'A' as string | undefined } });
    await waitFor(() => expect(hook.result.current.orders).toEqual([{ id: 'first' }]));
    hook.rerender({ user: 'B' });
    expect(hook.result.current.orders).toEqual([]);
    hook.rerender({ user: undefined });
    await act(async () => pending.resolve([{ id: 'second' }]));
    expect(hook.result.current).toMatchObject({ orders: [], loading: false });
  });
  it('ignores an old owner response arriving after the new response', async () => {
    const old = deferred<unknown[]>();
    mocks.listAccount.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ id: 'new' }]);
    const hook = renderHook(({ user }) => useAccountOrders(user), { initialProps: { user: 'A' } });
    hook.rerender({ user: 'B' });
    await waitFor(() => expect(hook.result.current.orders).toEqual([{ id: 'new' }]));
    await act(async () => old.resolve([{ id: 'old' }]));
    expect(hook.result.current.orders).toEqual([{ id: 'new' }]);
  });
  it('clears old details on order change and failure rather than showing a previous order', async () => {
    const pending = deferred<ReturnType<typeof detail>>();
    mocks.details.mockResolvedValueOnce(detail('one')).mockReturnValueOnce(pending.promise);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = renderHook(({ id }) => useOrderDetails(true, id, 'owner'), { initialProps: { id: 'one' } });
    await waitFor(() => expect(hook.result.current.order?.id).toBe('one'));
    hook.rerender({ id: 'two' });
    expect(hook.result.current.order).toBeNull();
    await act(async () => pending.reject(Error('denied')));
    expect(hook.result.current).toMatchObject({ order: null, items: [], isLoading: false, error: expect.any(Error) });
    log.mockRestore();
  });
  it('ignores late detail responses after closing and does not load without an actor', async () => {
    const pending = deferred<ReturnType<typeof detail>>(); mocks.details.mockReturnValue(pending.promise);
    const hook = renderHook(({ open, actor }) => useOrderDetails(open, 'one', actor), { initialProps: { open: true, actor: 'A' as string | undefined } });
    hook.rerender({ open: false, actor: 'A' });
    await act(async () => pending.resolve(detail('one')));
    expect(hook.result.current.order).toBeNull();
    hook.rerender({ open: true, actor: undefined });
    expect(mocks.details).toHaveBeenCalledTimes(1);
    expect(hook.result.current.order).toBeNull();
  });
  it('clears detail state and reloads under a new actor even for the same order ID', async () => {
    const next = deferred<ReturnType<typeof detail>>();
    mocks.details.mockResolvedValueOnce(detail('one')).mockReturnValueOnce(next.promise);
    const hook = renderHook(({ actor }) => useOrderDetails(true, 'one', actor), { initialProps: { actor: 'A' } });
    await waitFor(() => expect(hook.result.current.order?.id).toBe('one'));
    hook.rerender({ actor: 'B' });
    expect(hook.result.current.order).toBeNull();
    expect(mocks.details).toHaveBeenCalledTimes(2);
  });
});

it('exposes a failed read and retries only after an explicit action', async () => {
 const log = vi.spyOn(console, 'error').mockImplementation(() => {});
 try {
  mocks.listAccount.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce([{ id: 'recovered' }]);
  const h = renderHook(() => useAccountOrders('A'));
  await waitFor(() => expect(h.result.current.error).toBeInstanceOf(Error));
  expect(mocks.listAccount).toHaveBeenCalledTimes(1);
  act(() => h.result.current.retry());
  await waitFor(() => expect(h.result.current.orders).toEqual([{ id: 'recovered' }]));
  expect(h.result.current.error).toBeUndefined();
 } finally { log.mockRestore(); }
});
