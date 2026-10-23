import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { CartRepository } from '../application/cartService';
export function createSupabaseCartRepository(client: Pick<SupabaseClient<Database>, 'from'>): CartRepository {
  return {
    async read(ownerId) {
      const { data, error } = await client.from('carts').select('items').eq('user_id', ownerId).abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
      if (error) throw error;
      return data?.items;
    },
    async write(ownerId, items, updatedAt) {
      const { error } = await client.from('carts').upsert({ user_id: ownerId, items, updated_at: updatedAt }).abortSignal(AbortSignal.timeout(10_000));
      return { error };
    },
  };
}
