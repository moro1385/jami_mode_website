import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ProductCategoryRepository } from '../application/productCategoryService';
import { categoryFields } from '../domain/productCategories';
export function createSupabaseProductCategoryRepository(client: Pick<SupabaseClient<Database>, 'from'>): ProductCategoryRepository {
 return {
  async listCategories() {
   const { data, error } = await client.from('categories').select('id,name,slug').order('name', { ascending: true }).abortSignal(AbortSignal.timeout(10_000));
   if (error) throw error;
   if (!data) throw Error('Category list unavailable');
   return data;
  },
  async change(target, edit) {
   let query = client.from('products').update(edit).eq('id', target.id);
   for (const key of categoryFields) query = target.expected[key] === null ? query.is(key, null) : query.eq(key, target.expected[key]!);
   const { data, error } = await query.select('id,department,category,category_id').abortSignal(AbortSignal.timeout(10_000)).single();
   if (error) throw error;
   if (data?.id !== target.id || categoryFields.some(key => data[key] !== target.next[key])) throw Error('Product category was not confirmed');
  },
 };
}
