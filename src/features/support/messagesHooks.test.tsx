import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountMessages } from './presentation/useAccountMessages';
import { useUnreadMessages } from './presentation/useUnreadMessages';
import { accountMessages } from './messages';
import { MESSAGES_READ_EVENT, type SupportMessage } from './domain/support';

vi.mock('@/features/support/messages', () => ({ accountMessages: { list: vi.fn(), markRead: vi.fn(), unreadCount: vi.fn() } }));
function message(owner: string, read = false): SupportMessage {
  return { id: 'message-shared-id', user_id: owner, title: owner + ' title', body: owner + ' private body', is_read: read, created_at: '2026-10-01' };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('account-scoped message loading and writes', () => {
  it('ignores an old account response that arrives after the new account', async () => {
    const first = deferred<SupportMessage[]>(), second = deferred<SupportMessage[]>();
    vi.mocked(accountMessages.list).mockImplementation(id => id === 'A' ? first.promise : second.promise);
    const { result, rerender } = renderHook(({ id }) => useAccountMessages(id), { initialProps: { id: 'A' } });
    rerender({ id: 'B' });
    expect(result.current.messages).toEqual([]);
    await act(async () => { second.resolve([message('B')]); });
    expect(result.current.messages[0].user_id).toBe('B');
    await act(async () => { first.resolve([message('A')]); });
    expect(result.current.messages.map(row => row.user_id)).toEqual(['B']);
  });
  it('hides loaded old-account data while the new account is pending or fails', async () => {
    const second = deferred<SupportMessage[]>();
    vi.mocked(accountMessages.list).mockResolvedValueOnce([message('A')]).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ id }) => useAccountMessages(id), { initialProps: { id: 'A' } });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    rerender({ id: 'B' }); expect(result.current.messages).toEqual([]);
    await act(async () => { second.reject(Error('synthetic outage')); });
    expect(result.current.messages).toEqual([]); expect(result.current.loading).toBe(false);
  });
  it('clears messages on logout without requesting an anonymous inbox', async () => {
    vi.mocked(accountMessages.list).mockResolvedValue([message('A')]);
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useAccountMessages(id), { initialProps: { id: 'A' } });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    rerender({ id: undefined });
    expect(result.current.messages).toEqual([]); expect(result.current.loading).toBe(false);
    expect(accountMessages.list).toHaveBeenCalledTimes(1);
  });
  it('reverts a rejected read mark for the same account', async () => {
    vi.mocked(accountMessages.list).mockResolvedValue([message('A')]);
    vi.mocked(accountMessages.markRead).mockRejectedValue({ code: '42501' });
    const { result } = renderHook(() => useAccountMessages('A'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => { await result.current.markAsRead(message('A')); });
    expect(result.current.messages[0].is_read).toBe(false);
    expect(accountMessages.markRead).toHaveBeenCalledWith('A', 'message-shared-id');
  });
  it('does not let a late old-account write failure revert the new inbox', async () => {
    const write = deferred<void>();
    vi.mocked(accountMessages.list).mockImplementation(async id => [message(id, id === 'B')]);
    vi.mocked(accountMessages.markRead).mockReturnValue(write.promise);
    const { result, rerender } = renderHook(({ id }) => useAccountMessages(id), { initialProps: { id: 'A' } });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    let pending!: Promise<void>;
    act(() => { pending = result.current.markAsRead(message('A')); });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.messages[0]?.user_id).toBe('B'));
    await act(async () => { write.reject(Error('synthetic failure')); await pending; });
    expect(result.current.messages[0].is_read).toBe(true);
  });
  it('notifies unread counters only after successful persistence and skips already-read or foreign messages', async () => {
    const notify = vi.fn(); window.addEventListener(MESSAGES_READ_EVENT, notify);
    try {
      vi.mocked(accountMessages.list).mockResolvedValue([message('A')]);
      vi.mocked(accountMessages.markRead).mockResolvedValue(undefined);
      const { result } = renderHook(() => useAccountMessages('A'));
      await waitFor(() => expect(result.current.messages).toHaveLength(1));
      await act(async () => { await result.current.markAsRead(message('A')); });
      expect(notify).toHaveBeenCalledTimes(1);
      expect(result.current.messages[0].is_read).toBe(true);
      await act(async () => { await result.current.markAsRead(message('A', true)); await result.current.markAsRead(message('B')); });
      expect(accountMessages.markRead).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener(MESSAGES_READ_EVENT, notify); }
  });
  it('does not display a response containing another owner’s row', async () => {
    vi.mocked(accountMessages.list).mockResolvedValue([message('B')]);
    const { result } = renderHook(() => useAccountMessages('A'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual([]);
  });
});

describe('unread counts belong to an account and current request', () => {
  it('does not expose a previous account count and resets on logout', async () => {
    const first = deferred<number>(), second = deferred<number>();
    vi.mocked(accountMessages.unreadCount).mockImplementation(id => id === 'A' ? first.promise : second.promise);
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useUnreadMessages(id), { initialProps: { id: 'A' } });
    rerender({ id: 'B' }); expect(result.current).toBe(0);
    await act(async () => { second.resolve(2); }); expect(result.current).toBe(2);
    await act(async () => { first.resolve(9); }); expect(result.current).toBe(2);
    rerender({ id: undefined }); expect(result.current).toBe(0);
  });
  it('keeps a newer refresh from being overwritten by an older count', async () => {
    const first = deferred<number>(), second = deferred<number>();
    vi.mocked(accountMessages.unreadCount).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useUnreadMessages('A'));
    act(() => { window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); });
    await act(async () => { second.resolve(1); });
    await act(async () => { first.resolve(7); });
    expect(result.current).toBe(1);
  });
  it('refreshes on polling and read events, then releases timers and listeners', async () => {
    vi.useFakeTimers();
    vi.mocked(accountMessages.unreadCount).mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const { result, unmount } = renderHook(() => useUnreadMessages('A'));
    await act(async () => {}); expect(result.current).toBe(3);
    await act(async () => { window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); }); expect(result.current).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); }); expect(result.current).toBe(1);
    unmount();
    await act(async () => { window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); await vi.advanceTimersByTimeAsync(60000); });
    expect(accountMessages.unreadCount).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(0);
  });
});

it('makes inbox failure distinct from empty and offers a scoped retry', async () => {
 vi.mocked(accountMessages.list).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce([message('A')]);
 const h = renderHook(() => useAccountMessages('A'));
 await waitFor(() => expect(h.result.current.error).toBeInstanceOf(Error));
 expect(accountMessages.list).toHaveBeenCalledTimes(1); act(() => h.result.current.retry());
 await waitFor(() => expect(h.result.current.messages).toHaveLength(1)); expect(h.result.current.error).toBeUndefined();
});
