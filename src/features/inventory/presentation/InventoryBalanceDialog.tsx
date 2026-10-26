import {useCallback} from 'react';
import type {AdjustmentRow} from '../domain/adjustments';
import {adminInventoryReport} from '../admin';
import {useRequestScope} from '@/shared/presentation/useRequestScope';
import {useScopedAsyncRead} from '@/shared/presentation/useScopedAsyncRead';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
export function InventoryBalanceDialog({ownerId,row,close}:{ownerId:string;row:AdjustmentRow;close():void}){
 const scope=JSON.stringify([ownerId,row.productId,row.variantId]),capture=useRequestScope(scope);
 const load=useCallback(()=>adminInventoryReport.read(ownerId,row.productId,row.variantId!,capture()),[ownerId,row.productId,row.variantId,capture]);
 const read=useScopedAsyncRead(scope,load),balance=read.value;
 const format=(value:string)=>BigInt(value).toLocaleString('fa-IR');
 return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent><DialogHeader><DialogTitle>تفکیک موجودی و رزرو</DialogTitle><DialogDescription>{row.productName}؛ {row.sku||'بدون کد'}؛ {row.size||'—'} / {row.color||'—'}</DialogDescription></DialogHeader>
  <div className="space-y-3 max-h-[65vh] overflow-auto">
   {read.loading?<p role="status">در حال خواندن گزارش موجودی…</p>:read.error?<p role="alert">{read.error instanceof Error?read.error.message:'گزارش دریافت نشد؛ مقدارها صفر فرض نمی‌شوند.'}</p>:balance?<>
    <dl className="grid grid-cols-2 gap-2"><dt>ماندهٔ جاری برای رزرو</dt><dd>{balance.available===null?'نامعتبر':balance.available.toLocaleString('fa-IR')}</dd><dt>رزرو باز سفارش جدید</dt><dd>{format(balance.reserved)}</dd><dt>از رزرو باز: مهلت گذشته و آزاد نشده</dt><dd>{format(balance.overdue)}</dd><dt>تعداد در پرداخت‌های ثبت‌شدهٔ سفارش جدید</dt><dd>{format(balance.paid)}</dd><dt>تعداد آزادشده در سوابق سفارش جدید</dt><dd>{format(balance.released)}</dd><dt>تعداد در سفارش‌های قدیمی</dt><dd>{format(balance.legacy)}</dd></dl>
    <p>رزرو سفارش جدید قبلاً از مانده کم شده است؛ دوباره از آن کم نمی‌شود. این عدد، شمارش فیزیکی انبار یا جمع مانده و رزرو نیست. تعداد پرداخت‌شده، فروش خالص پس از مرجوعی را نشان نمی‌دهد.</p>
    <p>{balance.saleEnabled?'محصول از نظر پرچم‌های انتشار و ناموجودی برای فروش باز است.':'محصول پیش‌نویس یا ناموجود علامت خورده است؛ ماندهٔ عددی به معنی مجازبودن فروش نیست.'}</p>
    {balance.overdue!=='0'&&<p role="alert">پایان مهلت به‌تنهایی موجودی را آزاد نمی‌کند؛ به‌ویژه اگر پرداخت شروع شده باشد. این گزارش هیچ رزروی را آزاد نمی‌کند.</p>}
    {balance.reviewLines!=='0'&&<p role="alert">{format(balance.reviewLines)} ردیف سفارش نیازمند بررسی است؛ از این گزارش موجودی فیزیکی یا فروش قطعی استنتاج نکنید.</p>}
    <p className="text-xs break-all">زمان گزارش: {balance.asOf}</p>
   </>:null}
   <Button variant="outline" disabled={read.loading} onClick={read.retry}>بازخوانی تفکیک موجودی</Button><Button variant="outline" onClick={close}>بستن گزارش</Button>
  </div></DialogContent></Dialog>;
}
