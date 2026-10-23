import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useScopedAction } from './useScopedAction';
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
afterEach(cleanup);
it('locks duplicate actions synchronously while allowing an unrelated row', async () => {
 const d = deferred<string>(), task = vi.fn(() => d.promise), h = renderHook(() => useScopedAction('A'));
 let first!: ReturnType<typeof h.result.current.run>;
 act(() => { first = h.result.current.run('row', task); });
 expect(await h.result.current.run('row', task)).toEqual({ kind: 'ignored' });
 await act(async () => { expect(await h.result.current.run('other', async () => 'other')).toEqual({ kind: 'success', value: 'other' }); });
 expect(task).toHaveBeenCalledTimes(1); expect(h.result.current.pending('row')).toBe(true);
 await act(async () => { d.resolve('saved'); expect(await first).toEqual({ kind: 'success', value: 'saved' }); });
 expect(h.result.current.pending('row')).toBe(false);
});
it('releases a rejected operation for an explicit retry without retrying automatically', async () => {
 const h = renderHook(() => useScopedAction('A')), failure = Error('denied'), task = vi.fn().mockRejectedValue(failure);
 await act(async () => { expect(await h.result.current.run('row', task)).toEqual({ kind: 'failed', error: failure }); });
 expect(task).toHaveBeenCalledTimes(1); expect(h.result.current.pending('row')).toBe(false);
 await act(async () => { await h.result.current.run('row', task); }); expect(task).toHaveBeenCalledTimes(2);
});
it('ignores old results and handlers after A to B to A without blocking the new lifetime', async () => {
 const d = deferred<string>(), h = renderHook(({ id }) => useScopedAction(id), { initialProps: { id: 'A' } });
 const oldRun = h.result.current.run; let old!: ReturnType<typeof oldRun>;
 act(() => { old = oldRun('row', () => d.promise); }); h.rerender({ id: 'B' }); h.rerender({ id: 'A' });
 const staleTask = vi.fn(); expect(await oldRun('other', staleTask)).toEqual({ kind: 'ignored' }); expect(staleTask).not.toHaveBeenCalled();
 await act(async () => { expect(await h.result.current.run('row', async () => 'new')).toEqual({ kind: 'success', value: 'new' }); });
 await act(async () => { d.resolve('stale'); expect(await old).toEqual({ kind: 'ignored' }); });
});
it('does not dispatch unsigned work or report completion after unmount', async () => {
 const task = vi.fn(), unsigned = renderHook(() => useScopedAction(undefined));
 expect(await unsigned.result.current.run('row', task)).toEqual({ kind: 'ignored' }); expect(task).not.toHaveBeenCalled();
 const d = deferred<string>(), h = renderHook(() => useScopedAction('A')); let pending!: ReturnType<typeof h.result.current.run>;
 act(() => { pending = h.result.current.run('row', () => d.promise); }); h.unmount();
 d.resolve('done'); expect(await pending).toEqual({ kind: 'ignored' });
});
