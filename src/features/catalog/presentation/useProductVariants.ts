import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { adminProducts, type AdminVariant } from '../admin';
import type { VariantField, VariantFormValues } from '../domain/adminProducts';
export function useProductVariants(ownerId: string | undefined, productId: string) {
 const scope = ownerId ? JSON.stringify([ownerId, productId]) : undefined;
 const load = useCallback(() => adminProducts.listVariants(productId), [productId]);
 const read = useScopedAsyncRead(scope, load), actions = useScopedAction(scope), capture = useRequestScope(scope);
 const [overlay, setOverlay] = useState<AdminVariant[] | null>(null);
 useEffect(() => setOverlay(null), [read.value]);
 const variants = overlay ?? read.value ?? [];
 const tail = useRef(Promise.resolve()), queued = useRef(0), failed = useRef(false);
 const [editing, setEditing] = useState(false);
 function update<K extends VariantField>(id: string, field: K, value: AdminVariant[K]) {
  const current = capture();
  if (!current() || actions.pending('write') || !variants.some(row => row.id === id)) return;
  setOverlay(previous => (previous ?? variants).map(row => row.id === id ? { ...row, [field]: value } : row));
  queued.current++; setEditing(true);
  // Every keystroke remains a captured edit; writes are ordered, not dropped while busy.
  tail.current = tail.current.then(async () => {
   try { if (current()) await adminProducts.updateVariantField(id, field, value); }
   catch (error) { if (current()) { failed.current = true; console.error('Variant edit failed:', error); } }
   finally {
    queued.current--;
    if (current() && queued.current === 0) {
     setEditing(false);
     if (failed.current) { failed.current = false; setOverlay(null); toast.error('ذخیره ویرایش تنوع انجام نشد؛ اطلاعات دوباره بارگیری می‌شود.'); read.retry(); }
    }
   }
  });
 }
 async function add(values: VariantFormValues) {
  if (queued.current || read.loading || read.error) return false;
  const result = await actions.run('write', () => adminProducts.addVariant(productId, values));
  if (result.kind === 'success') { setOverlay([...variants, result.value]); toast.success('تنوع اضافه شد'); return true; }
  if (result.kind === 'failed') { console.error('Variant add failed:', result.error); toast.error(errorMessage(result.error, 'افزودن تنوع با شکست مواجه شد')); }
  return false;
 }
 async function remove(id: string) {
  if (queued.current || !variants.some(row => row.id === id)) return;
  const result = await actions.run('write', () => adminProducts.deleteVariant(id));
  if (result.kind === 'success') { setOverlay(variants.filter(row => row.id !== id)); toast.success('تنوع حذف شد'); }
  else if (result.kind === 'failed') { console.error('Variant delete failed:', result.error); toast.error(errorMessage(result.error, 'حذف تنوع با شکست مواجه شد')); }
 }
 return { variants, loading: read.loading, error: read.error, retry: () => { setOverlay(null); read.retry(); }, editing, busy: actions.pending('write'), update, add, remove };
}
