import { useCallback, useState } from 'react';
import type { AdminProduct } from '../domain/adminProducts';
import { categoryFields, previewProductCategories, productDepartments, productKinds, sameCategoryState, type CategoryEdit, type CategoryOption, type CategoryState, type ProductCategoryTarget } from '../domain/productCategories';
import type { ProductBatchReport } from '../application/productBatch';
import { MAX_PRODUCT_BATCH } from '../domain/productManagement';
import { adminProductCategories } from '../admin';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
const labels = { department: 'بخش فروشگاه', category: 'نوع محصول در فیلترها', category_id: 'دستهٔ کاتالوگ' };
export function ProductCategoryBatchControls({ selected, busy, ownerId, submit }: { selected: AdminProduct[]; busy: boolean; ownerId?: string; submit(targets: ProductCategoryTarget[], edit: CategoryEdit): Promise<ProductBatchReport | undefined> }) {
 const [expanded, setExpanded] = useState(false), [error, setError] = useState('');
 const [choices, setChoices] = useState({ department: 'keep', category: 'keep', category_id: 'keep' });
 const [preview, setPreview] = useState<{ targets: ProductCategoryTarget[]; edit: CategoryEdit; names: string[]; options: CategoryOption[] }>();
 const load = useCallback(() => adminProductCategories.listCategories(), []);
 const read = useScopedAsyncRead(expanded ? ownerId : undefined, load), options = read.value ?? [];
 const changing = preview?.targets.filter(target => !sameCategoryState(target.expected, target.next)).length ?? 0;
 const available = !!ownerId && !read.loading && !read.error && read.value !== undefined;
 const prepare = () => {
  try {
   const edit: CategoryEdit = {};
   for (const key of categoryFields) if (choices[key] !== 'keep') edit[key] = choices[key] === 'clear' ? null : choices[key];
   if (edit.category_id != null && !options.some(option => option.id === edit.category_id)) throw Error('دستهٔ انتخاب‌شده در فهرست نیست.');
   setPreview({ targets: previewProductCategories(selected, edit), edit, names: selected.map(product => product.name), options: options.map(option => ({ ...option })) }); setError('');
  } catch (error) { setError(error instanceof Error ? error.message : 'پیش‌نمایش دسته‌بندی انجام نشد.'); }
 };
 const describe = (key: keyof CategoryState, value: string | null) => value === null ? 'بدون دسته' : key === 'department' ? productDepartments.find(option => option.value === value)?.label ?? value : key === 'category' ? productKinds.find(option => option.value === value)?.label ?? value : preview?.options.find(option => option.id === value)?.name ?? 'دستهٔ قبلی در فهرست نیست';
 return <div className="border rounded-xl p-3 space-y-3">
  <Button variant="outline" disabled={busy || !!preview} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>ویرایش گروهی دسته‌بندی</Button>
  {expanded && <>
   <p className="text-sm text-muted-foreground">بخش فروشگاه، نوع محصول در فیلترها و دستهٔ کاتالوگ جدا هستند. فقط فیلدهای انتخاب‌شده تغییر می‌کنند؛ نوع، برند و طرح فعلی محصول حفظ می‌شوند و پس از جابه‌جایی باید متناسب باشند.</p>
   {read.loading ? <p role="status">در حال بارگیری دسته‌بندی‌ها…</p> : read.error ? <ReadFailure retry={read.retry} message="بارگیری دسته‌بندی‌ها با شکست مواجه شد." /> : <>
    <div className="flex flex-wrap gap-3">{categoryFields.map(key => <label key={key} className="space-y-1"><span className="block text-sm">{labels[key]}</span><select className="border rounded-md p-2" aria-label={labels[key] + ' گروهی'} disabled={busy || !!preview || !available} value={choices[key]} onChange={event => { setChoices(value => ({ ...value, [key]: event.target.value })); setError(''); }}>
     <option value="keep">بدون تغییر</option><option value="clear">حذف مقدار فعلی</option>
     {(key === 'department' ? productDepartments : key === 'category' ? productKinds : options.map(option => ({ value: option.id, label: option.name }))).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>)}</div>
    <Button variant="outline" disabled={busy || !available || !selected.length || selected.length > MAX_PRODUCT_BATCH || categoryFields.every(key => choices[key] === 'keep')} onClick={prepare}>پیش‌نمایش تغییر دسته‌بندی</Button>
   </>}
   {error && <p role="alert" className="text-destructive">{error}</p>}
  </>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(undefined); }}><DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
   <DialogHeader><DialogTitle>تأیید تغییر گروهی دسته‌بندی</DialogTitle><DialogDescription>دسته‌بندی {changing} محصول تغییر می‌کند؛ مقدار قبلی و جدید را بررسی کنید.</DialogDescription></DialogHeader>
   <div className="max-h-64 overflow-auto space-y-3">{preview?.targets.map((target, index) => <div key={target.id} className="border rounded p-2"><p className="font-medium">{preview.names[index]}</p>{categoryFields.map(key => <p key={key} className="text-sm">{labels[key]}: {describe(key, target.expected[key])} ← {describe(key, target.next[key])}</p>)}</div>)}</div>
   <p className="text-sm text-muted-foreground">در صورت تغییر هم‌زمان دسته‌بندی یا تأییدنشدن یک مورد، ادامه متوقف می‌شود؛ تغییرهای قبلی باقی می‌مانند.</p>
   <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>انصراف</Button><Button disabled={busy || !changing} onClick={async () => { if (!preview) return; const result = await submit(preview.targets, preview.edit); if (result) setPreview(undefined); }}>{busy ? 'در حال ثبت…' : 'تأیید و اعمال دسته‌بندی'}</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;
}
