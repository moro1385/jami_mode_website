import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ProductImageBatchRepository } from '../application/productImageBatchService';
import { imagesEqual } from '../domain/productImageBatches';
import { postgresImageArray } from './postgresImageArray';
export function createSupabaseProductImageBatchRepository(client: Pick<SupabaseClient<Database>, 'from'>): ProductImageBatchRepository {
 return { async change(target) {
  const previous = postgresImageArray(target.expected);
  const { data, error } = await client.from('products').update({ images: target.next }).eq('id', target.id)
   .filter('images', 'eq', previous).select('id,images').abortSignal(AbortSignal.timeout(10_000)).single();
  if (error) throw error;
  if (data?.id !== target.id || !imagesEqual(data.images, target.next)) throw Error('Product image order was not confirmed');
 } };
}
