import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AccountMessagesRepository, AdminSupportRepository, ContactRepository } from '../application/supportRepositories';
type Client = Pick<SupabaseClient<Database>, 'from'>;

export function createSupabaseAdminSupportRepository(client: Client): AdminSupportRepository {
  return {
    async listMessages() {
      const { data, error } = await client.from('user_messages').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    async insertMessage(message) {
      const { error } = await client.from('user_messages').insert(message);
      if (error) throw error;
    },
    async listTickets() {
      const { data, error } = await client.from('tickets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    async setTicketStatus(id, status) {
      const { error } = await client.from('tickets').update({ status }).eq('id', id);
      if (error) throw error;
    },
  };
}

export function createSupabaseAccountMessagesRepository(client: Client): AccountMessagesRepository {
  return {
    async list(userId) {
      const { data, error } = await client.from('user_messages').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    async markRead(userId, messageId) {
      const { error } = await client.from('user_messages').update({ is_read: true })
        .eq('id', messageId).eq('user_id', userId);
      if (error) throw error;
    },
    async unreadCount(userId) {
      const { count, error } = await client.from('user_messages').select('*', { count: 'exact', head: true })
        .eq('user_id', userId).eq('is_read', false);
      if (error) throw error;
      return count;
    },
  };
}

export function createSupabaseContactRepository(client: Client): ContactRepository {
  return {
    async insertTicket(ticket) {
      const { error } = await client.from('tickets').insert(ticket);
      if (error) throw error;
    },
  };
}
