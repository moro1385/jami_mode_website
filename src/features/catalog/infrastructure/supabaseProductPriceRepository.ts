import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ProductPriceRepository } from '../application/productPriceService';
export function createSupabaseProductPriceRepository(client: Pick<SupabaseClient<Database>, 'from'>): ProductPriceRepository {
 return { async change(target) {
  const { data, error } = await client.from('products').update({ price: target.nextPrice }).eq('id', target.id)
   .eq('price', target.expectedPrice).select('id,price').abortSignal(AbortSignal.timeout(10_000)).single();
  if (error) throw error;
  if (data?.id !== target.id || data.price !== target.nextPrice) throw Error('Product price was not confirmed');
 } };
}
