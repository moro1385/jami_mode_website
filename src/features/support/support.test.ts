import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createAdminSupportService, createContactService } from './application/supportServices';
import { createSupabaseAccountMessagesRepository, createSupabaseAdminSupportRepository, createSupabaseContactRepository } from './infrastructure/supabaseSupportRepositories';
import { createSupabaseCustomersRepository } from '@/features/customers/infrastructure/supabaseCustomersRepository';
import { customerDisplayName } from '@/features/customers/domain/customer';

function adminPort() {
  return { listMessages: vi.fn().mockResolvedValue([]), insertMessage: vi.fn().mockResolvedValue(undefined),
    listTickets: vi.fn().mockResolvedValue([]), setTicketStatus: vi.fn().mockResolvedValue(undefined) };
}
function transport(data: unknown = [], error: unknown = null) {
  const result = { data, error, count: 3 };
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  const from = vi.fn().mockReturnValue(query);
  return { query, from, client: { from } as unknown as Pick<SupabaseClient<Database>, 'from'> };
}

describe('support use cases', () => {
  it('retains the chosen recipient and trims only message title/body', async () => {
    const repository = adminPort();
    await createAdminSupportService(repository).sendMessage('owner-A', ' title ', ' body\n');
    expect(repository.insertMessage).toHaveBeenCalledWith({ user_id: 'owner-A', title: 'title', body: 'body' });
  });
  it.each([['pending', 'resolved'], ['resolved', 'pending'], ['legacy', 'pending']])('keeps the ticket transition from %s', async (status, expected) => {
    const repository = adminPort();
    expect(await createAdminSupportService(repository).toggleTicket({ id: 'ticket-A', status })).toBe(expected);
    expect(repository.setTicketStatus).toHaveBeenCalledWith('ticket-A', expected);
  });
  it('does not report a ticket transition when persistence is rejected', async () => {
    const repository = adminPort(), error = { code: '42501' };
    repository.setTicketStatus.mockRejectedValue(error);
    await expect(createAdminSupportService(repository).toggleTicket({ id: 'ticket-A', status: 'pending' })).rejects.toBe(error);
  });
  it('keeps public contact fields and blank email normalization, without adding status or identity', async () => {
    const repository = { insertTicket: vi.fn().mockResolvedValue(undefined) };
    await createContactService(repository).submit({ firstName: 'A', lastName: 'B', email: '', subject: ' Topic ', message: ' Body ' });
    expect(repository.insertTicket).toHaveBeenCalledWith({ first_name: 'A', last_name: 'B', email: null, subject: ' Topic ', message: ' Body ' });
  });
  it('keeps display fallbacks for unnamed or missing users', () => {
    const user = { id: 'owner-A', created_at: '2026-10-01', first_name: null, last_name: null, phone: null };
    expect(customerDisplayName([user], 'missing')).toBe('missing');
    expect(customerDisplayName([user], user.id)).toBe('owner-A');
    expect(customerDisplayName([{ ...user, phone: 'synthetic-phone' }], user.id)).toBe('synthetic-phone');
    expect(customerDisplayName([{ ...user, first_name: 'A' }], user.id)).toBe('A — بدون شماره');
  });
});

describe('support repository contracts and ownership', () => {
  it('keeps admin user reads newest-first without introducing role writes', async () => {
    const { query, client, from } = transport();
    expect(await createSupabaseCustomersRepository(client).list()).toEqual([]);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(query.update).not.toHaveBeenCalled();
  });
  it('binds both message reads and updates to the current owner', async () => {
    const { query, client } = transport(), repository = createSupabaseAccountMessagesRepository(client);
    await repository.list('owner-A'); await repository.markRead('owner-A', 'message-A');
    expect(query.eq.mock.calls).toEqual([['user_id', 'owner-A'], ['id', 'message-A'], ['user_id', 'owner-A']]);
    expect(query.update).toHaveBeenCalledWith({ is_read: true });
  });
  it('requests only the unread count for the current account', async () => {
    const { query, client } = transport();
    expect(await createSupabaseAccountMessagesRepository(client).unreadCount('owner-A')).toBe(3);
    expect(query.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
    expect(query.eq.mock.calls).toEqual([['user_id', 'owner-A'], ['is_read', false]]);
  });
  it('does not widen a ticket update into a whole-table write', async () => {
    const { query, client, from } = transport();
    await createSupabaseAdminSupportRepository(client).setTicketStatus('ticket-A', 'resolved');
    expect(from).toHaveBeenCalledWith('tickets');
    expect(query.update).toHaveBeenCalledWith({ status: 'resolved' });
    expect(query.eq).toHaveBeenCalledWith('id', 'ticket-A');
  });
  it('retains RLS failures across admin/account/contact boundaries', async () => {
    const failure = { code: '42501' }, { client } = transport(null, failure);
    await expect(createSupabaseCustomersRepository(client).list()).rejects.toBe(failure);
    await expect(createSupabaseAccountMessagesRepository(client).markRead('owner-A', 'message-A')).rejects.toBe(failure);
    await expect(createSupabaseAccountMessagesRepository(client).unreadCount('owner-A')).rejects.toBe(failure);
    await expect(createSupabaseAdminSupportRepository(client).listTickets()).rejects.toBe(failure);
    await expect(createSupabaseAdminSupportRepository(client).insertMessage({ user_id: 'owner-A', title: 'A', body: 'B' })).rejects.toBe(failure);
    await expect(createSupabaseContactRepository(client).insertTicket({ first_name: 'A', last_name: 'B', email: null, subject: 'A', message: 'B' })).rejects.toBe(failure);
  });
});
