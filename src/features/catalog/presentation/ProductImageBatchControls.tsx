import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { useState } from 'react';
import type { AdminProduct } from '../domain/adminProducts';
import { existingImageList, imagesEqual, validateImageBatch, type ProductImageTarget } from '../domain/productImageBatches';
import type { ProductBatchReport } from '../application/productBatch';
import { MAX_PRODUCT_BATCH } from '../domain/productManagement';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
type ImageDraft = { expected: string[]; order: number[] };
function freshDraft(product: AdminProduct): ImageDraft { const expected = existingImageList(product.images); return { expected, order: expected.map((_, index) => index) }; }
function ImageStrip({ urls, label }: { urls: string[]; label: string }) { return <div className="flex flex-wrap gap-2" aria-label={label}>{urls.map((url, index) => <div key={index} className="text-xs text-center"><img src={supabaseAssetUrl(url)} alt={label + ' ' + (index + 1)} loading="lazy" referrerPolicy="no-referrer" className="w-16 h-16 object-cover rounded" /><span>{index === 0 ? 'تصویر اصلی' : index + 1}</span></div>)}</div>; }
export function ProductImageBatchControls({ selected, busy, submit }: { selected: AdminProduct[]; busy: boolean; submit(targets: ProductImageTarget[]): Promise<ProductBatchReport | undefined> }) {
 const [expanded, setExpanded] = useState(false), [drafts, setDrafts] = useState<Record<string, ImageDraft>>({}), [error, setError] = useState('');
 const [preview, setPreview] = useState<{ targets: ProductImageTarget[]; names: string[] }>();
 const draftFor = (product: AdminProduct) => drafts[product.id] ?? freshDraft(product);
 const edit = (product: AdminProduct, update: (order: number[]) => number[]) => { try { const draft = draftFor(product); setDrafts(value => ({ ...value, [product.id]: { expected: [...draft.expected], order: update([...draft.order]) } })); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'ویرایش عکس انجام نشد.'); } };
 const prepare = () => {
  try {
   const targets = validateImageBatch(selected.map(product => { const draft = draftFor(product); if (!imagesEqual(product.images, draft.expected)) throw Error('عکس‌های یک محصول تغییر کرده‌اند؛ ابتدا بازنشانی آن محصول را بزنید.'); return { id: product.id, expected: draft.expected, next: draft.order.map(index => draft.expected[index]) }; }));
   setPreview({ targets, names: selected.map(product => product.name) }); setError('');
  } catch (error) { setError(error instanceof Error ? error.message : 'پیش‌نمایش عکس‌ها انجام نشد.'); }
 };
 const changing = preview?.targets.filter(target => !imagesEqual(target.expected, target.next)).length ?? 0;
 return <div className="border rounded-xl p-3 space-y-3">
  <Button variant="outline" disabled={busy || !!preview} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>ویرایش گروهی تصاویر</Button>
  {expanded && <>
   <p className="text-sm text-muted-foreground">برای هر محصول عکس اصلی و ترتیب نمایش را جدا انتخاب کنید. حذف از نمایش، فایل اصلی را از فضای ذخیره‌سازی پاک نمی‌کند. برای افزودن فایل از بخش بارگذاری گروهی عکس تازه استفاده کنید؛ حذف آخرین عکس از ویرایش تکی انجام می‌شود.</p>
   <div className="max-h-96 overflow-auto space-y-3">{selected.map(product => {
    let draft: ImageDraft; try { draft = draftFor(product); } catch { return <p key={product.id} role="alert">عکس‌های {product.name} برای ویرایش گروهی معتبر نیستند؛ ویرایش تکی را بررسی کنید.</p>; }
    const stale = !imagesEqual(product.images, draft.expected);
    return <fieldset key={product.id} aria-label={'تصاویر ' + product.name} className="border rounded p-3 space-y-2"><legend>{product.name}</legend>
     {stale && <p role="alert">فهرست عکس‌ها تغییر کرده؛ این محصول را بازنشانی کنید.</p>}
     {!draft.expected.length && <p>عکس قابل ویرایش گروهی ندارد؛ عکس‌های قدیمی یا تازه را از ویرایش تکی بررسی کنید.</p>}
     <div className="flex flex-wrap gap-3">{draft.order.map((source, position) => <div key={source} className="border rounded p-2 space-y-1 text-xs"><img src={supabaseAssetUrl(draft.expected[source])} alt={product.name + ' عکس ' + (source + 1)} loading="lazy" referrerPolicy="no-referrer" className="w-20 h-20 object-cover rounded" /><p>{position === 0 ? 'تصویر اصلی' : 'عکس ' + (position + 1)}</p>
      <div className="flex flex-wrap gap-1"><button type="button" className="underline" aria-label={`اصلی‌کردن عکس ${source + 1} ${product.name}`} disabled={busy || stale || position === 0 || !!preview} onClick={() => edit(product, order => [order[position], ...order.filter((_, index) => index !== position)])}>اصلی</button>
      <button type="button" className="underline" aria-label={`قبلی عکس ${source + 1} ${product.name}`} disabled={busy || stale || position === 0 || !!preview} onClick={() => edit(product, order => { [order[position - 1], order[position]] = [order[position], order[position - 1]]; return order; })}>قبلی</button>
      <button type="button" className="underline" aria-label={`بعدی عکس ${source + 1} ${product.name}`} disabled={busy || stale || position === draft.order.length - 1 || !!preview} onClick={() => edit(product, order => { [order[position + 1], order[position]] = [order[position], order[position + 1]]; return order; })}>بعدی</button>
      <button type="button" className="underline text-destructive" aria-label={`حذف از نمایش عکس ${source + 1} ${product.name}`} disabled={busy || stale || draft.order.length <= 1 || !!preview} onClick={() => edit(product, order => order.filter((_, index) => index !== position))}>حذف از نمایش</button></div>
     </div>)}</div>
     <Button variant="outline" size="sm" aria-label={'بازنشانی تصاویر ' + product.name} disabled={busy || !!preview} onClick={() => { setDrafts(value => { const next = { ...value }; delete next[product.id]; return next; }); setError(''); }}>بازنشانی</Button>
    </fieldset>;
   })}</div>
   <Button variant="outline" disabled={busy || !!preview || !selected.length || selected.length > MAX_PRODUCT_BATCH} onClick={prepare}>پیش‌نمایش تغییر تصاویر</Button>
   {error && <p role="alert" className="text-destructive">{error}</p>}
  </>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(undefined); }}><DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
   <DialogHeader><DialogTitle>تأیید تغییر گروهی تصاویر</DialogTitle><DialogDescription>تصویر اصلی، ترتیب یا نمایش عکس‌های {changing} محصول تغییر می‌کند. پیش و پس از تغییر را بررسی کنید.</DialogDescription></DialogHeader>
   <div className="max-h-80 overflow-auto space-y-4">{preview?.targets.map((target, index) => <div key={target.id} className="space-y-2"><p className="font-medium">{preview.names[index]}</p><p>قبل</p><ImageStrip urls={target.expected} label={'قبل ' + preview.names[index]} /><p>بعد</p><ImageStrip urls={target.next} label={'بعد ' + preview.names[index]} /></div>)}</div>
   <p className="text-sm text-muted-foreground">در صورت تغییر هم‌زمان عکس‌ها یا تأییدنشدن نتیجه، ادامه متوقف می‌شود؛ تغییرهای قبلی باقی می‌مانند.</p>
   <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>انصراف</Button><Button disabled={busy || !changing} onClick={async () => { if (!preview) return; const result = await submit(preview.targets); if (result) { setPreview(undefined); setDrafts(value => { const next = { ...value }; for (const id of [...result.succeeded, ...result.unchanged]) delete next[id]; return next; }); } }}>{busy ? 'در حال ثبت…' : 'تأیید و اعمال تصاویر'}</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;
}
