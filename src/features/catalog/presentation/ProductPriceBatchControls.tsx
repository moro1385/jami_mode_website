import { useState } from 'react';
import type { AdminProduct } from '../domain/adminProducts';
import { previewProductPrices, type ProductPriceTarget, type PriceChangeMode } from '../domain/productPrices';
import { MAX_PRODUCT_BATCH } from '../domain/productManagement';
import type { ProductBatchReport } from '../application/productBatch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
const rial = (value: number) => new Intl.NumberFormat('fa-IR').format(value) + ' ریال';
export function ProductPriceBatchControls({ selected, busy, submit }: { selected: AdminProduct[]; busy: boolean; submit(targets: ProductPriceTarget[]): Promise<ProductBatchReport | undefined> }) {
 const [mode, setMode] = useState<PriceChangeMode>('fixed'), [input, setInput] = useState(''), [error, setError] = useState('');
 const [preview, setPreview] = useState<{ targets: ProductPriceTarget[]; names: string[] }>();
 const changing = preview?.targets.filter(target => target.expectedPrice !== target.nextPrice).length ?? 0;
 const prepare = () => { try { setPreview({ targets: previewProductPrices(selected, mode, input), names: selected.map(product => product.name) }); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'پیش‌نمایش قیمت انجام نشد.'); } };
 return <div className="border rounded-xl p-3 space-y-3">
  <h2 className="font-medium">ویرایش گروهی قیمت پایه</h2>
  <div className="flex flex-wrap items-center gap-3">
   <select className="border rounded-md p-2" aria-label="روش تغییر قیمت گروهی" value={mode} disabled={busy || !!preview} onChange={event => { setMode(event.target.value as PriceChangeMode); setInput(''); setError(''); }}>
    <option value="fixed">قیمت یکسان به ریال</option><option value="increase">افزایش درصدی</option><option value="decrease">کاهش درصدی</option>
   </select>
   <Input className="sm:max-w-xs" aria-label="مقدار تغییر قیمت" inputMode="decimal" placeholder={mode === 'fixed' ? 'مبلغ صحیح به ریال' : 'درصد بین صفر و صد'} value={input} disabled={busy || !!preview} onChange={event => { setInput(event.target.value); setError(''); }} />
   <Button variant="outline" disabled={busy || !selected.length || selected.length > MAX_PRODUCT_BATCH || !input.trim()} onClick={prepare}>پیش‌نمایش تغییر قیمت</Button>
  </div>
  <p className="text-sm text-muted-foreground">فقط قیمت پایه تغییر می‌کند؛ قیمت اختصاصی سایز/رنگ و سفارش‌های قبلی تغییر نمی‌کند. نتیجهٔ درصدی به نزدیک‌ترین ریال گرد می‌شود.</p>
  {error && <p role="alert" className="text-destructive">{error}</p>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(undefined); }}>
   <DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>تأیید تغییر گروهی قیمت</DialogTitle><DialogDescription>قیمت پایهٔ {changing} محصول تغییر می‌کند. قیمت قبلی و جدید را پیش از تأیید بررسی کنید.</DialogDescription></DialogHeader>
    <div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr><th>محصول</th><th>قیمت قبلی</th><th>قیمت جدید</th></tr></thead><tbody>{preview?.targets.map((target, index) => <tr key={target.id}><td>{preview.names[index]}</td><td>{rial(target.expectedPrice)}</td><td>{rial(target.nextPrice)}</td></tr>)}</tbody></table></div>
    <p className="text-sm text-muted-foreground">اگر قیمت محصولی از زمان پیش‌نمایش عوض شده باشد یا نتیجه تأیید نشود، ادامهٔ گروه متوقف می‌شود؛ تغییرهای قبلی باقی می‌مانند.</p>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>انصراف</Button><Button disabled={busy || !changing} onClick={async () => { if (!preview) return; const result = await submit(preview.targets); if (result) setPreview(undefined); }}>{busy ? 'در حال ثبت…' : 'تأیید و اعمال قیمت'}</Button></DialogFooter>
   </DialogContent>
  </Dialog>
 </div>;
}
