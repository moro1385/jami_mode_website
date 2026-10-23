import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listTickets: vi.fn(), toggleTicket: vi.fn(), listMessages: vi.fn(), sendMessage: vi.fn(), customers: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../support/admin', () => ({ adminSupport: mocks }));
vi.mock('@/features/customers/admin', () => ({ adminCustomers: { list: mocks.customers }, customerDisplayName: () => 'Name' }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { useAdminTickets } from './presentation/useAdminTickets';
import { useAdminMessages } from './presentation/useAdminMessages';
const ticket = { id: 'ticket', first_name: 'A', last_name: 'B', email: null, subject: 'Fixture', message: 'Body', status: 'pending', created_at: '2026-01-01' };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); mocks.listTickets.mockResolvedValue([ticket]); mocks.listMessages.mockResolvedValue([]); mocks.customers.mockResolvedValue([{ id: 'recipient' }]); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('separates a ticket read failure from empty and reloads after an explicit retry', async () => {
 mocks.listTickets.mockRejectedValueOnce(Error('offline')); const h = renderHook(() => useAdminTickets('A'));
 await waitFor(() => expect(h.result.current.error).toBeInstanceOf(Error)); expect(mocks.listTickets).toHaveBeenCalledTimes(1);
 act(() => h.result.current.retry()); await waitFor(() => expect(h.result.current.tickets).toHaveLength(1));
});
it('prevents duplicate status changes and rereads persisted status after success', async () => {
 const d = deferred<string>(); mocks.toggleTicket.mockReturnValue(d.promise); const h = renderHook(() => useAdminTickets('A'));
 await waitFor(() => expect(h.result.current.tickets).toHaveLength(1)); let pending!: Promise<void>;
 act(() => { pending = h.result.current.toggle(ticket); void h.result.current.toggle(ticket); }); expect(mocks.toggleTicket).toHaveBeenCalledTimes(1);
 mocks.listTickets.mockResolvedValue([{ ...ticket, status: 'resolved' }]); await act(async () => { d.resolve('resolved'); await pending; });
 await waitFor(() => expect(h.result.current.tickets[0].status).toBe('resolved')); expect(mocks.success).toHaveBeenCalledTimes(1);
});
it('hides old rows immediately and suppresses mutation feedback after switching administrators', async () => {
 const d = deferred<string>(); mocks.toggleTicket.mockReturnValue(d.promise); const h = renderHook(({ id }) => useAdminTickets(id), { initialProps: { id: 'A' } });
 await waitFor(() => expect(h.result.current.tickets).toHaveLength(1)); let pending!: Promise<void>; act(() => { pending = h.result.current.toggle(ticket); });
 mocks.listTickets.mockResolvedValue([]); h.rerender({ id: 'B' }); expect(h.result.current.tickets).toEqual([]);
 await act(async () => { d.resolve('resolved'); await pending; }); expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
});
it('freezes duplicate sends and does not reset a draft after its form unmounts', async () => {
 const d = deferred<void>(); mocks.sendMessage.mockReturnValue(d.promise); const h = renderHook(() => useAdminMessages('A'));
 await waitFor(() => expect(h.result.current.users).toHaveLength(1)); let pending!: Promise<boolean>;
 act(() => { pending = h.result.current.send('recipient', 'Title', 'Body'); });
 expect(await h.result.current.send('recipient', 'Title', 'Body')).toBe(false); expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
 h.unmount(); d.resolve(); expect(await pending).toBe(false); expect(mocks.success).not.toHaveBeenCalled();
});
it('refuses sends before recipient loading succeeds and retains failed drafts for retry', async () => {
 mocks.customers.mockRejectedValueOnce(Error('offline')); const h = renderHook(() => useAdminMessages('A'));
 await waitFor(() => expect(h.result.current.userError).toBeTruthy()); expect(await h.result.current.send('recipient', 'Title', 'Body')).toBe(false); expect(mocks.sendMessage).not.toHaveBeenCalled();
 act(() => h.result.current.retryUsers()); await waitFor(() => expect(h.result.current.users).toHaveLength(1));
 mocks.sendMessage.mockRejectedValueOnce(Error('denied'));
 await act(async () => { expect(await h.result.current.send('recipient', 'Title', 'Body')).toBe(false); });
 expect(mocks.error).toHaveBeenCalledWith('خطا در ارسال پیام'); expect(mocks.success).not.toHaveBeenCalled();
});
