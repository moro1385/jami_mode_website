import type { ProductImageUploadTarget } from '../domain/productImageUploads';
import { adminProductImageUploads } from '../admin';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { useRequestScope } from '@/shared/presentation/useRequestScope';
import type { ProductStatusReport } from '../application/productStatusService';
import type { ProductStatusTarget } from '../domain/productManagement';
import type { ProductPriceTarget } from '../domain/productPrices';
import { sameCategoryState, type CategoryEdit, type ProductCategoryTarget } from '../domain/productCategories';
import { imagesEqual, type ProductImageTarget } from '../domain/productImageBatches';
import { adminProductImageBatch, adminProductCategories, adminProductPrices, adminProductStatus, adminProducts, type AdminProduct } from '../admin';
export function useAdminProducts(ownerId?: string) {
 const capture = useRequestScope(ownerId), batchLock = useRef(false);
 const [batchBusy, setBatchBusy] = useState(false), [batchReport, setBatchReport] = useState<ProductStatusReport>();
 const [batchKind, setBatchKind] = useState<'status' | 'price' | 'category' | 'images'>('status');
 const load = useCallback(() => adminProducts.listProducts(), []);
 const read = useScopedAsyncRead(ownerId, load), actions = useScopedAction(ownerId);
 async function mutate(id: string, task: () => Promise<unknown>, success: string, failure: string) {
  if (batchLock.current) return false;
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
 async function bulkChange<T extends { id: string }, R extends ProductStatusReport>(targets: T[], kind: 'status' | 'price' | 'category' | 'images', matches: (product: AdminProduct, target: T) => boolean, task: (current: () => boolean) => Promise<R>) {
  const current = capture();
  if (!current() || batchLock.current || read.loading || read.error || !read.value || read.value.some(product => actions.pending(product.id))) return;
  if (targets.some(target => !read.value?.some(product => product.id === target.id && matches(product, target)))) { toast.error('فهرست محصولات تغییر کرده؛ دوباره بررسی کنید.'); read.retry(); return; }
  batchLock.current = true; setBatchBusy(true); setBatchReport(undefined); setBatchKind(kind);
  try {
   const result = await task(current);
   if (!current()) return;
   setBatchReport(result); read.retry();
   if (result.failed.length) toast.error('تغییر گروهی کامل نشد؛ گزارش نتیجه را بررسی کنید.');
   else toast.success(kind === 'status' ? 'بررسی و تغییر وضعیت محصولات پایان یافت.' : kind === 'price' ? 'بررسی و تغییر قیمت محصولات پایان یافت.' : kind === 'category' ? 'بررسی و تغییر دسته‌بندی محصولات پایان یافت.' : 'بررسی و تغییر تصاویر محصولات پایان یافت.');
   return result;
  } catch { if (current()) toast.error('تغییر گروهی انجام نشد؛ انتخاب محصولات را بررسی کنید.'); }
  finally { batchLock.current = false; if (current()) setBatchBusy(false); }
 }
 const bulkStatus = (targets: ProductStatusTarget[], active: boolean) => bulkChange(targets, 'status', (product, target) => product.is_active === target.expectedActive, current => adminProductStatus.update(targets, active, current));
 const bulkPrices = (targets: ProductPriceTarget[]) => bulkChange(targets, 'price', (product, target) => product.price === target.expectedPrice, current => adminProductPrices.update(targets, current));
 const bulkCategories = (targets: ProductCategoryTarget[], edit: CategoryEdit) => bulkChange(targets, 'category', (product, target) => sameCategoryState(product, target.expected), current => adminProductCategories.update(targets, edit, current));
 const bulkImages = (targets: ProductImageTarget[]) => bulkChange(targets, 'images', (product, target) => imagesEqual(product.images, target.expected), current => adminProductImageBatch.update(targets, current));
 const bulkImageUploads = (targets: ProductImageUploadTarget[]) => bulkChange(targets, 'images', (product, target) => imagesEqual(product.images, target.expected), current => adminProductImageUploads.upload(targets, current, ownerId));
 return { bulkImageUploads, bulkImages, bulkCategories, bulkStatus, bulkPrices, batchKind, batchReport, busy: batchBusy || !!read.value?.some(product => actions.pending(product.id)), products: read.value ?? [], loading: read.loading, error: read.error, retry: read.retry, pending: (id: string) => batchBusy || actions.pending(id),
  remove: (id: string) => mutate(id, () => adminProducts.deleteProduct(id), 'محصول با موفقیت حذف شد', 'حذف محصول با شکست مواجه شد'),
  duplicate: (product: AdminProduct) => mutate(product.id, () => adminProducts.duplicateProduct(product), 'محصول با موفقیت کپی شد', 'کپی محصول با شکست مواجه شد'),
  changePrice: (id: string, price: number) => mutate(id, () => adminProducts.changePrice(id, price), 'قیمت با موفقیت بروزرسانی شد', 'بروزرسانی قیمت با شکست مواجه شد') };
}
