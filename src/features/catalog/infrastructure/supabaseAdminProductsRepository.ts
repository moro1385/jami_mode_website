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
      void id;
      throw Error('حذف دائمی محصول بسته است؛ از وضعیت پیش‌نویس استفاده کنید.');
    },
    async listVariants(productId) {
      const { data, error } = await client.from('product_variants').select('*')
        .eq('product_id', productId).order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    async insertVariant(variant) {
      if (variant.stock_quantity !== 0) throw Error('تنوع تازه باید با موجودی صفر ساخته شود.');
      const { data, error } = await client.from('product_variants').insert({product_id:variant.product_id,size:variant.size,color:variant.color,sku:variant.sku,price:variant.price}).select().single();
      if (error) throw error;
      return data;
    },
    async updateVariant(id, patch) {
      if ('stock_quantity' in patch) throw Error('ویرایش مستقیم موجودی در این مسیر مجاز نیست.');
      const { error } = await client.from('product_variants').update(patch).eq('id', id);
      if (error) throw error;
    },
    async deleteVariant(id) {
      void id;
      throw Error('حذف دائمی تنوع برای حفظ موجودی و سابقه بسته است.');
    },
  };
}
