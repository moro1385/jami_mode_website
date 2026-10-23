import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminProductsRepository } from '../application/adminProductsRepository';

export function createSupabaseAdminProductsRepository(client: Pick<SupabaseClient<Database>, 'from'>): AdminProductsRepository {
  return {
    async listProducts() {
      const { data, error } = await client.from('products').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    async insertProduct(product) {
      const { error } = await client.from('products').insert([product]);
      if (error) throw error;
    },
    async updateProduct(id, patch) {
      const { error } = await client.from('products').update(patch).eq('id', id);
      if (error) throw error;
    },
    async deleteProduct(id) {
      const { error } = await client.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    async listVariants(productId) {
      const { data, error } = await client.from('product_variants').select('*')
        .eq('product_id', productId).order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    async insertVariant(variant) {
      const { data, error } = await client.from('product_variants').insert(variant).select().single();
      if (error) throw error;
      return data;
    },
    async updateVariant(id, patch) {
      const { error } = await client.from('product_variants').update(patch).eq('id', id);
      if (error) throw error;
    },
    async deleteVariant(id) {
      const { error } = await client.from('product_variants').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
