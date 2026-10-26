import {useCallback,useRef,useState} from 'react';
import type {AdjustmentRow} from '../domain/adjustments';
import {prepareAdjustment,type AdjustmentTarget,type AdjustmentEntry} from '../domain/adjustments';
import type {InventoryCursor} from '../application/inventoryActions';
import {adminInventoryActions} from '../admin';
import {useScopedAsyncRead} from '@/shared/presentation/useScopedAsyncRead';
import {useRequestScope} from '@/shared/presentation/useRequestScope';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
export function InventoryAdjustmentControls({ownerId,row,close,refresh}:{ownerId:string;row:AdjustmentRow;close():void;refresh():void}){
 const capture=useRequestScope(JSON.stringify([ownerId,row.productId,row.variantId])),lock=useRef(false);
 const [change,setChange]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<AdjustmentEntry>();
 const [initial]=useState(()=>{try{return{pending:adminInventoryActions.pending(ownerId,row.productId,row.variantId!) as AdjustmentTarget|undefined,error:''};}catch{return{pending:undefined,error:'یادداشت ناتمام خوانده نشد؛ برای حفظ درخواست قبلی، اصلاح تازه شروع نمی‌شود.'};}});
 const [target,setTarget]=useState<AdjustmentTarget|undefined>(initial.pending),[pending,setPending]=useState(!!initial.pending),[recoveryWarning,setRecoveryWarning]=useState(false),[stale,setStale]=useState(false);
 const load=useCallback(()=>adminInventoryActions.status(ownerId,capture()),[ownerId,capture]);const status=useScopedAsyncRead(ownerId,load);
 const [history,setHistory]=useState<AdjustmentEntry[]>(),[cursor,setCursor]=useState<InventoryCursor|null>(null),[historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState('');
 async function submit(){if(!target||lock.current||initial.error)return;const current=capture();lock.current=true;setBusy(true);setError('');setPending(true);
  try{const result=await adminInventoryActions.adjust(ownerId,target,current);if(current()){setReceipt(result.entry);setRecoveryWarning(result.recoveryWarning);setPending(false);refresh();}}
  catch(error){if(current()){if(error&&typeof error==='object'&&'code'in error&&error.code==='INVENTORY_STALE'){setPending(false);setTarget(undefined);setStale(true);setError('موجودی یا مشخصات تنوع تغییر کرده؛ صفحه را بازخوانی و دوباره بازبینی کنید.');refresh();}else {try{const saved=adminInventoryActions.pending(ownerId,row.productId,row.variantId!);if(saved){setTarget(saved);setPending(true);setError('نتیجهٔ اصلاح تأیید نشد؛ درخواست ذخیره‌شده را با همان شناسه دوباره بررسی کنید.');}else{setPending(false);setError('اصلاح ارسال نشد؛ امکان قفل مشترک و ذخیرهٔ یادداشت مرورگر را بررسی کنید.');}}catch{setError('نتیجهٔ اصلاح و دسترسی به یادداشت تأیید نشد؛ پیش‌نمایش و شناسهٔ درخواست را نگه دارید و تاریخچه را بررسی کنید.');}}}}
  finally{lock.current=false;if(current())setBusy(false);}
 }
 async function readHistory(next:InventoryCursor|null){if(historyBusy||lock.current)return;const current=capture();setHistoryBusy(true);setHistoryError('');try{const result=await adminInventoryActions.history(ownerId,row.productId,row.variantId!,next,current);if(current()){if(next&&result.entries.some(entry=>history?.some(previous=>previous.id===entry.id)))throw Error('تاریخچه تکراری دریافت شد.');setHistory(previous=>next?[...(previous??[]),...result.entries]:result.entries);setCursor(result.nextCursor);}}catch{if(current())setHistoryError('خواندن تاریخچه انجام نشد؛ دوباره تلاش کنید.');}finally{if(current())setHistoryBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onPointerDownOutside={event=>{if(busy)event.preventDefault();}}>
  <DialogHeader><DialogTitle>اصلاح و تاریخچهٔ موجودی</DialogTitle><DialogDescription>{row.productName}؛ {row.sku||'بدون کد'}؛ {row.size||'—'} / {row.color||'—'}</DialogDescription></DialogHeader>
  <div className="max-h-[65vh] overflow-auto space-y-3">
   {status.loading?<p role="status">در حال بررسی فعال‌بودن اصلاح انبار…</p>:status.error?<><p role="alert">بررسی قابلیت انبار انجام نشد؛ هیچ اصلاحی ارسال نشده است.</p><Button variant="outline" onClick={status.retry}>بررسی دوبارهٔ قابلیت انبار</Button></>:!status.value?.adjustmentsEnabled&&!pending?<p>اصلاح موجودی هنوز فعال نشده است.</p>:null}
   {initial.error&&<p role="alert">{initial.error}</p>}
   {pending&&<p>یک درخواست ناتمام برای همین تنوع در این مرورگر وجود دارد. مقدار و دلیل آن ثابت می‌مانند؛ بررسی دوباره همان شناسه را می‌فرستد. پاک‌کردن داده‌های مرورگر می‌تواند این امکان بازیابی را از بین ببرد.</p>}
   {!receipt&&!target&&!stale&&status.value?.adjustmentsEnabled&&!initial.error&&<><p>موجودی ثبت‌شده در بازبینی: {row.quantity??'نامعتبر'}. افزایش را مثبت و کاهش را منفی وارد کنید؛ این اصلاح روی موجودی ثبت‌شده اعمال می‌شود.</p><label>افزایش یا کاهش<Input aria-label="افزایش یا کاهش موجودی" inputMode="text" value={change} onChange={event=>setChange(event.target.value)}/></label><label>دلیل اصلاح<Input aria-label="دلیل اصلاح موجودی" value={reason} maxLength={500} onChange={event=>setReason(event.target.value)}/></label><Button disabled={busy||row.quantity===null} onClick={()=>{try{setTarget(prepareAdjustment(row,change,reason,crypto.randomUUID()));setError('');}catch(error){setError(error instanceof Error?error.message:'انتخاب معتبر نیست.');}}}>پیش‌نمایش اصلاح موجودی</Button></>}
   {target&&pending&&<details><summary>نسخهٔ قابل کپی درخواست ناتمام</summary><textarea aria-label="درخواست ناتمام قابل کپی" readOnly dir="ltr" className="w-full h-32 border" value={JSON.stringify(target,null,2)}/></details>}
   {target&&!receipt&&<div className="border rounded p-3 space-y-2"><p>قبل: {target.expected.quantity}؛ تغییر: {target.delta}؛ بعد: {target.expected.quantity+target.delta}</p><p>دلیل: {target.reason}</p><p className="text-xs break-all" dir="ltr">{target.idempotencyKey}</p>
    <Button disabled={busy||initial.error!==''||!status.value||(!pending&&!status.value.adjustmentsEnabled)||!status.value.historyAvailable} onClick={()=>void submit()}>{busy?'در حال بررسی…':pending?'بررسی دوبارهٔ همین درخواست':'تأیید و ثبت اصلاح موجودی'}</Button>
    {!pending&&<Button variant="outline" disabled={busy} onClick={()=>setTarget(undefined)}>ویرایش پیش‌نمایش</Button>}
   </div>}
   {receipt&&<div role="status"><p>اصلاح موجودی تأیید شد: {receipt.before} ← {receipt.after}</p><p>دلیل: {receipt.reason}</p><p>شناسهٔ ثبت: {receipt.id}</p></div>}
   {recoveryWarning&&<p role="alert">ثبت سروری تأیید شد؛ بستن یادداشت مرورگر تأیید نشد. بررسی دوباره، همان ثبت قبلی را برمی‌گرداند.</p>}
   {error&&<p role="alert">{error}</p>}
   {status.value?.historyAvailable&&<><Button variant="outline" disabled={busy||historyBusy} onClick={()=>void readHistory(null)}>نمایش تاریخچهٔ اصلاحات دستی</Button>{historyBusy&&<p role="status">در حال خواندن تاریخچه…</p>}{historyError&&<p role="alert">{historyError}</p>}
    {history&&<><p>این فهرست فقط اصلاحات ثبت‌شده از مسیر جدید را نشان می‌دهد؛ رزرو سفارش و ویرایش‌های قدیمی در آن نیستند.</p>{!history.length?<p>اصلاح دستی ثبت‌شده‌ای در این مسیر وجود ندارد.</p>:<ul className="space-y-2">{history.map(entry=><li key={entry.id} className="border rounded p-2"><p>{entry.before} ← {entry.after}؛ {entry.reason}</p><p className="text-xs break-all">زمان: {entry.createdAt}؛ مدیر: {entry.actorId}</p></li>)}</ul>}{cursor&&<Button variant="outline" disabled={busy||historyBusy} onClick={()=>void readHistory(cursor)}>اصلاحات قدیمی‌تر</Button>}</>}
   </>}
  </div><DialogFooter><Button variant="outline" disabled={busy} onClick={close}>بستن</Button></DialogFooter>
 </DialogContent></Dialog>;
}
