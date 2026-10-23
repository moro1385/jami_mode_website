import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ReturnsRepository } from '../application/returnsService';
export function createSupabaseReturnsRepository(client: Pick<SupabaseClient<Database>, 'from'>): ReturnsRepository {
  return {
    async listAdmin() {
      const { data, error } = await client.from('return_requests').select('*,orders(id)').order('created_at', { ascending: false });
      if (error) throw error;
      if (!data?.length) return [];
      const ids = [...new Set(data.map(request => request.user_id))];
      const profiles = await client.from('profiles').select('id,first_name,last_name,phone').in('id', ids);
      if (profiles.error) throw profiles.error;
      const byId = new Map((profiles.data ?? []).map(profile => [profile.id, profile]));
      return data.map(request => ({ ...request, profiles: byId.get(request.user_id) ?? { first_name: null, last_name: null, phone: null } }));
    },
    async changeStatus(id, status) {
      const { data, error } = await client.from('return_requests').update({ status }).eq('id', id).select('id,status').maybeSingle();
      if (error || !data || data.status !== status) throw Error('Status was not saved');
    },
    async listOrders(userId) {
      const { data, error } = await client.from('orders').select('id,created_at').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(order => ({ id: order.id, number: order.id.split('-')[0].toUpperCase(), createdAt: order.created_at }));
    },
    async insert(request) {
      const { error } = await client.from('return_requests').insert(request);
      if (error) throw error;
    },
  };
}
