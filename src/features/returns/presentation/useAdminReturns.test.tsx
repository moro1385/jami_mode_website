import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listAdmin: vi.fn(), changeStatus: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../returns', () => ({ returnsService: mocks }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { useAdminReturns } from './useAdminReturns';
const row = { id: 'return', status: 'pending' };
beforeEach(() => { vi.clearAllMocks(); mocks.listAdmin.mockResolvedValue([row]); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('rejects unknown targets and reloads persisted state after a denied status update', async () => {
 mocks.changeStatus.mockRejectedValue(Error('denied'));
 const h = renderHook(() => useAdminReturns('A')); await waitFor(() => expect(h.result.current.requests).toHaveLength(1));
 await h.result.current.changeStatus('foreign', 'approved'); expect(mocks.changeStatus).not.toHaveBeenCalled();
 await act(async () => { await h.result.current.changeStatus('return', 'approved'); });
 await waitFor(() => expect(mocks.listAdmin).toHaveBeenCalledTimes(2));
 expect(h.result.current.requests[0].status).toBe('pending'); expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalledTimes(1);
});
it('suppresses stale success and exposes read failures without displaying another administrator’s rows', async () => {
 let resolve!: () => void; mocks.changeStatus.mockReturnValue(new Promise<void>(r => { resolve = r; }));
 const h = renderHook(({ id }) => useAdminReturns(id), { initialProps: { id: 'A' } }); await waitFor(() => expect(h.result.current.requests).toHaveLength(1));
 let pending!: Promise<void>; act(() => { pending = h.result.current.changeStatus('return', 'approved'); });
 mocks.listAdmin.mockRejectedValueOnce(Error('offline')); h.rerender({ id: 'B' }); expect(h.result.current.requests).toEqual([]);
 await act(async () => { resolve(); await pending; }); await waitFor(() => expect(h.result.current.error).toBeTruthy());
 expect(h.result.current.requests).toEqual([]); expect(mocks.success).not.toHaveBeenCalled();
});
