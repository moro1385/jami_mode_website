import { useCallback } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { adminProducts, type AdminProduct } from '../admin';
export function useAdminProducts(ownerId?: string) {
 const load = useCallback(() => adminProducts.listProducts(), []);
 const read = useScopedAsyncRead(ownerId, load), actions = useScopedAction(ownerId);
 async function mutate(id: string, task: () => Promise<unknown>, success: string, failure: string) {
  if (!read.value?.some(product => product.id === id)) return false;
  const result = await actions.run(id, task);
  if (result.kind === 'success') { toast.success(success); read.retry(); return true; }
  if (result.kind === 'failed') {
   console.error('Product mutation failed:', result.error);
   const error = result.error;
   if ((typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') || errorMessage(error, '').includes('products_slug_key')) toast.error('این نامک (Slug) قبلاً برای محصول دیگری استفاده شده — لطفاً کمی تغییرش بده.');
   else toast.error(errorMessage(error, failure));
  }
  return false;
 }
 return { products: read.value ?? [], loading: read.loading, error: read.error, retry: read.retry, pending: actions.pending,
  remove: (id: string) => mutate(id, () => adminProducts.deleteProduct(id), 'محصول با موفقیت حذف شد', 'حذف محصول با شکست مواجه شد'),
  duplicate: (product: AdminProduct) => mutate(product.id, () => adminProducts.duplicateProduct(product), 'محصول با موفقیت کپی شد', 'کپی محصول با شکست مواجه شد'),
  changePrice: (id: string, price: number) => mutate(id, () => adminProducts.changePrice(id, price), 'قیمت با موفقیت بروزرسانی شد', 'بروزرسانی قیمت با شکست مواجه شد') };
}
