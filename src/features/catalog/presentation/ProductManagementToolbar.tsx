import { ProductImageRecoveryControls } from './ProductImageRecoveryControls';
import { ProductImageUploadControls } from './ProductImageUploadControls';
import type { ProductImageUploadTarget } from '../domain/productImageUploads';
import type { ProductImageUploadReport } from '../application/productImageUploadService';
import { ProductImageBatchControls } from './ProductImageBatchControls';
import type { ProductImageTarget } from '../domain/productImageBatches';
import { ProductCategoryBatchControls } from './ProductCategoryBatchControls';
import type { CategoryEdit, ProductCategoryTarget } from '../domain/productCategories';
import { ProductPriceBatchControls } from './ProductPriceBatchControls';
import type { ProductPriceTarget } from '../domain/productPrices';
import { useState } from 'react';
import type { AdminProduct } from '../domain/adminProducts';
import { MAX_PRODUCT_BATCH, type ProductStatusFilter, type ProductStatusTarget } from '../domain/productManagement';
import type { ProductStatusReport } from '../application/productStatusService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
export function ProductManagementToolbar({ search, status, changeSearch, changeStatus, selected, busy, report, reportKind, submit, submitPrices, ownerId, submitCategories, submitImages, submitImageUploads }: {
 search: string; status: ProductStatusFilter; changeSearch(value: string): void; changeStatus(value: ProductStatusFilter): void;
 selected: AdminProduct[]; busy: boolean; report?: ProductStatusReport; reportKind?: 'status' | 'price' | 'category' | 'images';
 submitImageUploads(targets: ProductImageUploadTarget[]): Promise<ProductImageUploadReport | undefined>;
 submitImages(targets: ProductImageTarget[]): Promise<ProductStatusReport | undefined>; ownerId?: string;
 submitCategories(targets: ProductCategoryTarget[], edit: CategoryEdit): Promise<ProductStatusReport | undefined>;
 submitPrices(targets: ProductPriceTarget[]): Promise<ProductStatusReport | undefined>;
 submit(targets: ProductStatusTarget[], active: boolean): Promise<ProductStatusReport | undefined>;
}) {
 const [desired, setDesired] = useState(false);
 const [preview, setPreview] = useState<{ targets: ProductStatusTarget[]; names: string[]; active: boolean }>();
 const changing = preview?.targets.filter(target => target.expectedActive !== preview.active).length ?? 0;
 return <div className="space-y-4">
  <div className="admin-toolbar">
   <Input className="sm:max-w-sm" aria-label="جست‌وجوی محصولات" placeholder="جست‌وجو با نام، نامک، برند یا دسته" value={search} disabled={busy || !!preview} onChange={event => changeSearch(event.target.value)} />
   <select className="border rounded-md p-2" aria-label="فیلتر وضعیت محصولات" value={status} disabled={busy || !!preview} onChange={event => changeStatus(event.target.value as ProductStatusFilter)}>
    <option value="all">همه وضعیت‌ها</option><option value="active">فعال</option><option value="draft">پیش‌نویس</option>
   </select>
  </div>
  {selected.length>0?<section className="admin-bulk-panel" aria-label="ویرایش گروهی محصولات"><p className="admin-bulk-title">ویرایش گروهی · {selected.length.toLocaleString('fa-IR')} محصول انتخاب‌شده</p><div className="admin-bulk-grid">  <div className="flex flex-wrap items-center gap-3 border rounded-xl p-3">
   <span>{selected.length} محصول انتخاب شده</span>
   <select className="border rounded-md p-2" aria-label="وضعیت گروهی" value={String(desired)} disabled={busy || !!preview} onChange={event => setDesired(event.target.value === 'true')}>
    <option value="false">تبدیل به پیش‌نویس</option><option value="true">فعال‌کردن</option>
   </select>
   <Button variant="outline" disabled={busy || !selected.length || selected.length > MAX_PRODUCT_BATCH} onClick={() => setPreview({ targets: selected.map(product => ({ id: product.id, expectedActive: product.is_active })), names: selected.map(product => product.name), active: desired })}>پیش‌نمایش تغییر وضعیت</Button>
   <span className="text-sm text-muted-foreground">حداکثر {MAX_PRODUCT_BATCH} محصول در هر نوبت</span>
  </div>
  <ProductPriceBatchControls selected={selected} busy={busy || !!preview} submit={submitPrices} />
</div><div className="admin-advanced-actions">  <ProductCategoryBatchControls selected={selected} busy={busy || !!preview} ownerId={ownerId} submit={submitCategories} />
  <ProductImageBatchControls selected={selected} busy={busy || !!preview} submit={submitImages} />

</div></section>:<p className="admin-selection-hint">برای ویرایش گروهی، محصولات موردنظر را از جدول انتخاب کنید.</p>}
  <ProductImageUploadControls selected={selected} busy={busy || !!preview} submit={submitImageUploads} />
  <details className="admin-recovery"><summary>بازیابی بارگذاری‌های قبلی و بررسی گالری</summary><div className="pt-3"><ProductImageRecoveryControls selected={selected} ownerId={ownerId} busy={busy || !!preview}/></div></details>
  {report && <div role="status" className="border rounded-xl p-3 space-y-1">
   <p>{report.succeeded.length} تغییر تأیید شد؛ {report.unchanged.length} مورد {reportKind === 'price' ? 'نیازی به تغییر قیمت نداشت.' : reportKind === 'category' ? 'نیازی به تغییر دسته‌بندی نداشت.' : reportKind === 'images' ? 'نیازی به تغییر تصاویر نداشت.' : 'از قبل همین وضعیت را داشت.'}</p>
   {!!report.failed.length && <p>نتیجهٔ {report.failed.length} مورد تأیید نشد؛ {report.unattempted.length} مورد بعدی اجرا نشد. فهرست را دوباره بررسی کنید؛ تغییرهای قبلی برگردانده نشده‌اند.</p>}
  </div>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(undefined); }}>
   <DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>تأیید تغییر گروهی وضعیت</DialogTitle><DialogDescription>{preview?.targets.length ?? 0} محصول انتخاب شده؛ وضعیت {changing} محصول به {preview?.active ? 'فعال' : 'پیش‌نویس'} تغییر می‌کند. محصولات پیش‌نویس در فروشگاه نمایش داده نمی‌شوند.</DialogDescription></DialogHeader>
    <ul className="max-h-48 overflow-auto list-disc pr-5">{preview?.names.map((name, index) => <li key={preview.targets[index].id}>{name}</li>)}</ul>
    <p className="text-sm text-muted-foreground">اگر نتیجهٔ یک مورد تأیید نشود، موارد بعدی اجرا نمی‌شوند؛ تغییرهای تأییدشده باقی می‌مانند.</p>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>انصراف</Button><Button disabled={busy || !changing} onClick={async () => { if (!preview) return; const result = await submit(preview.targets, preview.active); if (result) setPreview(undefined); }}>{busy ? 'در حال ثبت…' : 'تأیید و اعمال وضعیت'}</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
