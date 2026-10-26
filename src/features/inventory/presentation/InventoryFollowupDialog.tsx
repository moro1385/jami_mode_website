import {useCallback,useRef,useState} from 'react';
import type {AdjustmentRow} from '../domain/adjustments';
import {followupLabels,prepareFollowup,type FollowupTarget,type FollowupEntry,type FollowupStatus,type FollowupCursor} from '../domain/followup';
import {adminInventoryFollowup} from '../admin';
import {FollowupError} from '../infrastructure/httpInventoryFollowup';
import {useRequestScope} from '@/shared/presentation/useRequestScope';
import {useScopedAsyncRead} from '@/shared/presentation/useScopedAsyncRead';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
function FollowupHistory({ownerId,row}:{ownerId:string;row:AdjustmentRow}){
 const [cursors,setCursors]=useState<(FollowupCursor|null)[]>([null]),cursor=cursors.at(-1)!,scope=JSON.stringify([ownerId,row.productId,row.variantId,cursor]),capture=useRequestScope(scope);
 const load=useCallback(()=>adminInventoryFollowup.history(ownerId,row.productId,row.variantId!,cursor,capture()),[ownerId,row.productId,row.variantId,cursor,capture]);const read=useScopedAsyncRead(scope,load);
 return <section aria-label="سابقهٔ پیگیری هشدار" className="space-y-2"><h3>سابقهٔ ثبت‌شدهٔ پیگیری</h3>
  {read.loading?<p role="status">در حال خواندن سابقهٔ پیگیری…</p>:read.error?<><p role="alert">سابقه دریافت نشد؛ خالی فرض نمی‌شود.</p><Button onClick={read.retry}>بازخوانی سابقهٔ پیگیری</Button></>:read.value?<>{!read.value.entries.length?<p>در این صفحه سابقه‌ای ثبت نشده است.</p>:<ol className="space-y-2">{read.value.entries.map(e=><li className="border rounded p-2" key={e.id}><p>از {followupLabels[e.beforeStatus]} به {followupLabels[e.status]}؛ نسخهٔ {e.revision}</p><p>دلیل: {e.reason}</p><p>مانده هنگام ثبت: {e.quantity===null?'نامعتبر':e.quantity}؛ حد: {e.threshold}</p><div className="text-xs space-y-1"><p>شناسهٔ مدیر:</p><p dir="ltr" className="break-all text-left">{e.actorId}</p><p>زمان ثبت:</p><p dir="ltr" className="text-left">{e.createdAt}</p><p>شناسهٔ رسید:</p><p dir="ltr" className="break-all text-left">{e.id}</p></div></li>)}</ol>}</>:null}
  <div className="flex gap-2"><Button variant="outline" disabled={read.loading||cursors.length===1} onClick={()=>setCursors(p=>p.slice(0,-1))}>سابقهٔ جدیدتر</Button><Button variant="outline" disabled={read.loading||!!read.error||!read.value?.nextCursor} onClick={()=>{const next=read.value?.nextCursor;if(next)setCursors(p=>[...p,next]);}}>سابقهٔ قدیمی‌تر</Button></div>
 </section>;
}
export function InventoryFollowupDialog({ownerId,row,close}:{ownerId:string;row:AdjustmentRow;close():void}){
 const scope=JSON.stringify([ownerId,row.productId,row.variantId]),capture=useRequestScope(scope),lock=useRef(false);
 const load=useCallback(()=>adminInventoryFollowup.read(ownerId,row.productId,row.variantId!,capture()),[ownerId,row.productId,row.variantId,capture]);const read=useScopedAsyncRead(scope,load),value=read.value;
 const [status,setStatus]=useState<FollowupStatus>('in_progress'),[reason,setReason]=useState(''),[target,setTarget]=useState<FollowupTarget>(),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<FollowupEntry>(),[showHistory,setShowHistory]=useState(false);
 async function save(){if(!target||lock.current)return;const current=capture();lock.current=true;setBusy(true);setPending(true);setError('');
  try{const result=await adminInventoryFollowup.save(ownerId,target,current);if(current()){setReceipt(result);setPending(false);read.retry();}}
  catch(failure){if(current()){
   if(failure instanceof FollowupError&&['FOLLOWUP_STALE_CONTEXT','FOLLOWUP_STALE_REVISION','FOLLOWUP_INACTIVE'].includes(failure.code)){setPending(false);setTarget(undefined);setError('موجودی، حد هشدار یا پیگیری تغییر کرده است؛ اطلاعات تازه را بازبینی و پیش‌نمایش جدید بسازید.');read.retry();}
   else setError('ثبت پیگیری تأیید نشد؛ با همان شناسه دوباره بررسی کنید. درخواست تازه خودکار ارسال نمی‌شود.');
  }}finally{lock.current=false;if(current())setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle>پیگیری و سابقهٔ هشدار</DialogTitle><DialogDescription>{row.productName}؛ {row.sku||'بدون کد'}؛ {row.size||'—'} / {row.color||'—'}</DialogDescription></DialogHeader><div className="space-y-3 max-h-[65vh] overflow-auto">
  <p>ثبت پیگیری موجودی را تغییر نمی‌دهد و هشدار کمبود را پنهان نمی‌کند. «بازبینی‌شده» تأیید رفع کمبود نیست. تغییر موجودی، مشخصات تنوع یا حد هشدار، پیگیری قبلی را از اعتبار می‌اندازد.</p>
  {read.loading?<p role="status">در حال خواندن پیگیری…</p>:read.error?<><p role="alert">خواندن وضعیت پیگیری انجام نشد؛ ثبت خودکار انجام نمی‌شود.</p><Button onClick={read.retry}>بازخوانی پیگیری</Button></>:value?<>
   <p>وضعیت معتبر فعلی: {followupLabels[value.status]}؛ مانده: {value.quantity===null?'نامعتبر یا در دسترس نیست':value.quantity}؛ حد: {value.threshold===null?'غیرفعال':value.threshold}؛ نسخهٔ پیگیری: {value.revision}</p>
   {value.contextChanged&&<p role="alert">اطلاعات انبار یا حد هشدار از زمان پیگیری قبلی تغییر کرده؛ بازبینی قبلی برای وضعیت فعلی معتبر نیست.</p>}
   {!value.canWrite&&<p>ثبت جدید برای این هشدار در دسترس نیست؛ سابقه همچنان قابل بررسی است.</p>}
   {!target&&!receipt&&value.canWrite&&<><label>وضعیت پیگیری<select aria-label="وضعیت پیگیری" className="block border rounded p-2" value={status} onChange={e=>setStatus(e.target.value as FollowupStatus)}>{Object.entries(followupLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>دلیل پیگیری<Input aria-label="دلیل پیگیری" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button onClick={()=>{try{setTarget(prepareFollowup(value,status,reason,crypto.randomUUID()));setError('');}catch(e){setError(e instanceof Error?e.message:'پیگیری معتبر نیست.');}}}>پیش‌نمایش پیگیری</Button></>}
  </>:null}
  {target&&!receipt&&<div className="border rounded p-3 space-y-2"><p>وضعیت پیشنهادی: {followupLabels[target.status]}؛ نسخهٔ حد: {target.policyRevision}؛ نسخهٔ پیگیری: {target.expectedRevision}</p><p>دلیل: {target.reason}</p><p dir="ltr" className="break-all text-xs">{target.idempotencyKey}</p><Button disabled={busy} onClick={()=>void save()}>{busy?'در حال بررسی پیگیری…':pending?'بررسی دوبارهٔ همین پیگیری':'تأیید و ثبت پیگیری'}</Button>{!pending&&<Button variant="outline" onClick={()=>setTarget(undefined)}>ویرایش پیش‌نمایش پیگیری</Button>}{pending&&<p>درخواست فقط در همین پنجره نگه داشته شده است؛ پس از بستن، وضعیت فعلی را دوباره از سرور بخوانید. تکرار خودکار انجام نمی‌شود.</p>}</div>}
  {receipt&&<p role="status">ثبت پیگیری تأیید شد؛ وضعیت {followupLabels[receipt.status]}، نسخهٔ {receipt.revision}. هشدار بر اساس موجودی جاری باقی می‌ماند.</p>}
  {error&&<p role="alert">{error}</p>}
  <Button variant="outline" onClick={()=>setShowHistory(p=>!p)}>{showHistory?'بستن سابقهٔ پیگیری':'نمایش سابقهٔ پیگیری'}</Button>{showHistory&&<FollowupHistory key={receipt?.id??'before-save'} ownerId={ownerId} row={row}/>}
 </div><Button variant="outline" disabled={busy} onClick={close}>بستن پیگیری</Button></DialogContent></Dialog>;
}
