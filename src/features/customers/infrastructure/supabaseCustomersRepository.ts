import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { CustomersRepository } from '../application/customersService';

export function createSupabaseCustomersRepository(client: Pick<SupabaseClient<Database>, 'from'>): CustomersRepository {
  return {
    async list() {
      const { data, error } = await client.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  };
}
