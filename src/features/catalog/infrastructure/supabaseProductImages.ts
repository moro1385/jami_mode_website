import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ProductImagesRepository, ProductImageStorage } from '../application/productImagesRepository';

export function createSupabaseProductImagesRepository(client: Pick<SupabaseClient<Database>, 'from'>): ProductImagesRepository {
  return {
    async read(productId) {
      const { data, error } = await client.from('products').select('images').eq('id', productId).single();
      if (error) throw error;
      return data.images || [];
    },
    async replace(productId, images) {
      const { error } = await client.from('products').update({ images }).eq('id', productId);
      if (error) throw error;
    },
  };
}

export function createSupabaseProductImageStorage(client: Pick<SupabaseClient<Database>, 'storage'>): ProductImageStorage {
  return {
    async upload(path, file) {
      const bucket = client.storage.from('product-images');
      const { error } = await bucket.upload(path, file);
      if (error) throw error;
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    async remove(filename) {
      // Existing cleanup is best-effort: keep returned SDK errors from becoming a metadata failure.
      await client.storage.from('product-images').remove([filename]);
    },
  };
}
