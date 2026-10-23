import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { adminProductImages, type AdminProductImage } from '../admin';
export function useProductImages(ownerId: string | undefined, productId: string) {
 const scope = ownerId ? JSON.stringify([ownerId, productId]) : undefined;
 const load = useCallback(() => adminProductImages.list(productId), [productId]);
 const read = useScopedAsyncRead(scope, load), actions = useScopedAction(scope), capture = useRequestScope(scope);
 const [overlay, setOverlay] = useState<AdminProductImage[] | null>(null);
 useEffect(() => setOverlay(null), [read.value]);
 const images = overlay ?? read.value ?? [];
 async function upload(files: File[]) {
  if (read.loading || read.error || !read.value) return;
  const current = capture();
  const result = await actions.run('write', () => adminProductImages.upload(productId, files, images.map(image => image.image_url), current));
  if (result.kind === 'success') { setOverlay([...images, ...result.value]); toast.success('تصاویر با موفقیت بارگذاری شدند'); }
  else if (result.kind === 'failed') { console.error('Image upload failed:', result.error); toast.error(errorMessage(result.error, 'بارگذاری تصویر با شکست مواجه شد')); }
 }
 async function remove(imageUrl: string) {
  if (read.loading || read.error || !images.some(image => image.image_url === imageUrl)) return;
  const current = capture();
  const result = await actions.run('write', async () => {
   await adminProductImages.removeReference(productId, imageUrl, images.map(image => image.image_url));
   // Storage cleanup is best effort after confirmed metadata removal, never a rollback claim.
   if (!current()) return;
   try { await adminProductImages.removeFile(imageUrl); } catch (error) { console.error('Image cleanup failed:', error); }
  });
  if (result.kind === 'success') { setOverlay(images.filter(image => image.image_url !== imageUrl)); toast.success('تصویر حذف شد'); }
  else if (result.kind === 'failed') { console.error('Image deletion failed:', result.error); toast.error(errorMessage(result.error, 'حذف تصویر با شکست مواجه شد')); }
 }
 return { images, loading: read.loading, error: read.error, retry: () => { setOverlay(null); read.retry(); }, busy: actions.pending('write'), upload, remove };
}
