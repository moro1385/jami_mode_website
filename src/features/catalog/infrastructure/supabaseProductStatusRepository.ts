import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ProductStatusRepository } from '../application/productStatusService';
export function createSupabaseProductStatusRepository(client: Pick<SupabaseClient<Database>, 'from'>): ProductStatusRepository {
 return { async change(target, active) {
  const { data, error } = await client.from('products').update({ is_active: active }).eq('id', target.id)
   .eq('is_active', target.expectedActive).select('id,is_active').abortSignal(AbortSignal.timeout(10_000)).single();
  if (error) throw error;
  if (data?.id !== target.id || data.is_active !== active) throw Error('Product status was not confirmed');
 } };
}
