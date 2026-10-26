import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ProductImageGalleryReader } from '../application/productImageRecovery';
import { existingImageList } from '../domain/productImageBatches';
export function createSupabaseProductImageGalleryReader(client: Pick<SupabaseClient<Database>, 'from'>): ProductImageGalleryReader {
 return { async read(id) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw Error('شناسه محصول معتبر نیست.');
  const { data, error } = await client.from('products').select('id,images,product_images(id,image_url,sort_order)').eq('id',id).abortSignal(AbortSignal.timeout(10_000)).single();
  if (error) throw error;
  if (!data || data.id !== id || !Array.isArray(data.product_images) || data.product_images.length > 50) throw Error('گالری محصول تأیید نشد.');
  const main = existingImageList(data.images);
  const legacy = data.product_images.map(image => {
   if (typeof image.id !== 'string' || !image.id || !Number.isSafeInteger(image.sort_order)) throw Error('ترتیب گالری قدیمی معتبر نیست.');
   return { id: image.id, url: existingImageList([image.image_url])[0], order: image.sort_order };
  }).sort((a,b)=>a.order-b.order);
  return { id, main, legacy };
 } };
}
