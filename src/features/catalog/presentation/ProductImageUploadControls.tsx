import { useEffect, useRef, useState } from 'react';
import type { AdminProduct } from '../domain/adminProducts';
import { existingImageList, imagesEqual } from '../domain/productImageBatches';
import { validateImageUploadBatch, type ProductImageUploadTarget } from '../domain/productImageUploads';
import type { ProductImageUploadReport } from '../application/productImageUploadService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
function LocalPhoto({ file }: { file: File }) {
 const [url, setUrl] = useState('');
 useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
 return <figure className="max-w-32"><img src={url || undefined} alt={file.name} className="w-24 h-24 rounded object-cover" /><figcaption className="break-all text-xs">{file.name}</figcaption></figure>;
}
type Draft = ProductImageUploadTarget;
export function ProductImageUploadControls({ selected, busy, submit }: { selected: AdminProduct[]; busy: boolean; submit(targets: ProductImageUploadTarget[]): Promise<ProductImageUploadReport | undefined> }) {
 const [expanded, setExpanded] = useState(false), [drafts, setDrafts] = useState<Record<string, Draft>>({}), [error, setError] = useState('');
 const [preview, setPreview] = useState<{ targets: Draft[]; names: string[] }>(), [checking, setChecking] = useState(false), [report, setReport] = useState<ProductImageUploadReport>();
 const lock = useRef(false), generation = useRef(0);
 useEffect(() => () => { generation.current++; }, []);
 // Selection edits invalidate asynchronous preview validation as well as hidden drafts.
 const selectionKey = selected.map(product => product.id).join(',');
 useEffect(() => { generation.current++; setPreview(undefined); setDrafts({}); setError(''); setChecking(false); }, [selectionKey]);
 const disabled = busy || checking || !!preview;
 const prepare = async () => {
  if (lock.current) return;
  lock.current = true; const version = generation.current; setChecking(true); setError('');
  try {
   const targets = selected.flatMap(product => {
    const draft = drafts[product.id]; if (!draft?.files.length) return [];
    if (!imagesEqual(product.images, draft.expected)) throw Error('فهرست عکس‌ها تغییر کرده؛ فایل‌های این محصول را دوباره انتخاب کنید.');
    return [draft];
   });
   const validated = await validateImageUploadBatch(targets);
   if (generation.current === version) setPreview({ targets: validated, names: validated.map(target => selected.find(product => product.id === target.id)!.name) });
  } catch (error) { if (generation.current === version) setError(error instanceof Error ? error.message : 'بررسی فایل‌ها انجام نشد.'); }
  finally { lock.current = false; if (generation.current === version) setChecking(false); }
 };
 if(!selected.length&&!report)return null;
 return <section className="border rounded-xl p-3 space-y-3">
  <Button variant="outline" disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>بارگذاری گروهی عکس تازه</Button>
  {expanded && <>
   <p>برای هر محصول فایل‌های خودش را انتخاب کنید؛ عکس‌ها به ترتیب انتخاب به انتهای فهرست فعلی اضافه می‌شوند. هر محصول حداکثر ۵ فایل، هر نوبت ۲۰ فایل و ۴۰ مگابایت؛ JPEG، PNG یا WebP تا ۵ مگابایت.</p>
   <div className="max-h-96 overflow-auto space-y-3">{selected.map(product => <fieldset key={product.id} className="border rounded p-3 space-y-2"><legend>{product.name}</legend>
    <input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label={'فایل‌های تازه ' + product.name} disabled={disabled} onChange={event => {
     try { const files = Array.from(event.target.files ?? []); const expected = existingImageList(product.images); setDrafts(value => ({ ...value, [product.id]: { id: product.id, expected, files, replaceLegacy: false } })); setError(''); } catch { setError('فهرست فعلی عکس‌های این محصول نیاز به بررسی جداگانه دارد.'); }
     event.target.value = '';
    }} />
    <div className="flex flex-wrap gap-2">{drafts[product.id]?.files.map((file, index) => <LocalPhoto key={index} file={file} />)}</div>
    {drafts[product.id]?.expected.length === 0 && !!drafts[product.id]?.files.length && <label className="block"><input type="checkbox" disabled={disabled} checked={drafts[product.id].replaceLegacy} onChange={event => setDrafts(value => ({ ...value, [product.id]: { ...value[product.id], replaceLegacy: event.target.checked } }))} /> تأیید می‌کنم عکس‌های تازه جای گالری قدیمیِ احتمالی را در نمایش می‌گیرند؛ اولین فایل تصویر اصلی می‌شود. فایل‌های قدیمی پاک نمی‌شوند.</label>}
    {!!drafts[product.id]?.files.length && <Button size="sm" variant="outline" disabled={disabled} onClick={() => setDrafts(value => { const next = { ...value }; delete next[product.id]; return next; })}>پاک‌کردن انتخاب فایل‌های {product.name}</Button>}
   </fieldset>)}</div>
   <Button variant="outline" disabled={disabled || !selected.some(product => drafts[product.id]?.files.length)} onClick={() => void prepare()}>{checking ? 'در حال بررسی فایل‌ها…' : 'پیش‌نمایش بارگذاری'}</Button>
   {error && <p role="alert">{error}</p>}
  </>}
  {report?.recoveryWarning && <p role="alert">اتصال عکس‌ها تأیید شد ولی بستن یادداشت محلی تأیید نشد؛ بخش بازیابی را بازخوانی کنید.</p>}
  {report && <div role="status" className="space-y-2"><p>{report.succeeded.length} محصول با عکس‌های تازه ثبت شد؛ {report.failed.length} مورد تأیید نشد و {report.unattempted.length} مورد اجرا نشد.</p>
   {report.attempts.some(attempt => attempt.state !== 'linked') && <details><summary>فایل‌های نیازمند بررسی؛ پیش از تلاش مجدد این گزارش را نگه دارید</summary><p>ممکن است فایل ارسال شده یا ثبت محصول انجام شده باشد؛ پاک‌سازی یا تلاش مجدد خودکار انجام نمی‌شود. ابتدا عکس‌های محصول و این مسیرها را بررسی کنید.</p><ul>{report.attempts.filter(attempt => attempt.state !== 'linked').map(attempt => <li key={attempt.path}><code dir="ltr">{attempt.path}</code> — {attempt.state === 'upload-unconfirmed' ? 'ارسال تأیید نشد' : attempt.state === 'uploaded-unlinked' ? 'ارسال شد؛ اتصال ثبت نشد' : 'نتیجهٔ اتصال به محصول تأیید نشد'}</li>)}</ul></details>}
  </div>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(undefined); }}><DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
   <DialogHeader><DialogTitle>تأیید بارگذاری عکس‌های تازه</DialogTitle><DialogDescription>نام محصول و فایل‌های مربوط به آن را بررسی کنید. تنها محصولات زیر تغییر می‌کنند؛ با اولین نتیجهٔ نامشخص ادامه متوقف می‌شود.</DialogDescription></DialogHeader>
   <div className="max-h-80 overflow-auto space-y-4">{preview?.targets.map((target, index) => <div key={target.id}><h3>{preview.names[index]}</h3><p>{target.expected.length ? `${target.expected.length} عکس فعلی حفظ می‌شود؛ تصویر اصلی تغییر نمی‌کند.` : 'عکس‌های تازه جای گالری قدیمیِ احتمالی را در نمایش می‌گیرند؛ اولین فایل تصویر اصلی است.'}</p><div className="flex flex-wrap gap-2">{target.files.map((file, position) => <LocalPhoto key={position} file={file} />)}</div></div>)}</div>
   <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>انصراف</Button><Button disabled={busy} onClick={async () => {
    if (!preview || lock.current) return;
    lock.current = true; const version = generation.current;
    try { const result = await submit(preview.targets); if (result && generation.current === version) { setReport(result); setDrafts({}); setPreview(undefined); } }
    finally { lock.current = false; }
   }}>{busy ? 'در حال بارگذاری…' : 'تأیید و بارگذاری عکس‌ها'}</Button></DialogFooter>
  </DialogContent></Dialog>
 </section>;
}
