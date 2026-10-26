import {useCallback,useRef,useState} from 'react';
import type {AdjustmentRow} from '../domain/adjustments';
import {preparePolicy,type PolicyTarget,type PolicyReceipt} from '../domain/policy';
import {adminInventoryPolicy} from '../admin';
import {PolicyError} from '../infrastructure/httpInventoryPolicy';
import {useRequestScope} from '@/shared/presentation/useRequestScope';
import {useScopedAsyncRead} from '@/shared/presentation/useScopedAsyncRead';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
export function InventoryPolicyDialog({ownerId,row,close}:{ownerId:string;row:AdjustmentRow;close():void}){
 const scope=JSON.stringify([ownerId,row.productId,row.variantId]),capture=useRequestScope(scope),lock=useRef(false);
 const load=useCallback(()=>adminInventoryPolicy.read(ownerId,row.productId,row.variantId!,capture()),[ownerId,row.productId,row.variantId,capture]);
 const read=useScopedAsyncRead(scope,load),value=read.value;
 const [text,setText]=useState(''),[disabled,setDisabled]=useState(false),[reason,setReason]=useState(''),[target,setTarget]=useState<PolicyTarget>(),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<PolicyReceipt>();
 async function save(){if(!target||lock.current)return;const current=capture();lock.current=true;setBusy(true);setPending(true);setError('');
  try{const result=await adminInventoryPolicy.save(ownerId,target,current);if(current()){setReceipt(result);setPending(false);read.retry();}}
  catch(failure){if(current()){if(failure instanceof PolicyError&&failure.code==='POLICY_STALE'){setPending(false);setTarget(undefined);setError('تنظیم توسط مدیر دیگری تغییر کرده؛ مقدار تازه را بازبینی و پیش‌نمایش جدید بسازید.');read.retry();}else setError('ثبت تنظیم تأیید نشد؛ با همان شناسه دوباره بررسی کنید. درخواست تازه خودکار ارسال نمی‌شود.');}}
  finally{lock.current=false;if(current())setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle>حد کمبود ذخیره‌شده</DialogTitle><DialogDescription>{row.productName}؛ {row.sku||'بدون کد'}؛ {row.size||'—'} / {row.color||'—'}</DialogDescription></DialogHeader>
  <div className="space-y-3 max-h-[65vh] overflow-auto">
   <p>این تنظیم برای همین تنوع در سرور ذخیره می‌شود و بین مرورگرها مشترک است. هشدار هنگام بازخوانی این پنجره محاسبه می‌شود؛ پیامک یا اعلان بیرونی ارسال نمی‌شود. فیلتر موقت صفحه مستقل است.</p>
   {read.loading?<p role="status">در حال خواندن حد کمبود…</p>:read.error?<><p role="alert">خواندن حد کمبود انجام نشد؛ هشدار خاموش یا موجودی صفر فرض نمی‌شود.</p><Button variant="outline" onClick={read.retry}>بازخوانی حد کمبود</Button></>:value?<>
    <p>حد ذخیره‌شده: {value.threshold===null?'تنظیم نشده یا غیرفعال':value.threshold.toLocaleString('fa-IR')}؛ ماندهٔ جاری: {value.available===null?'نامعتبر':value.available.toLocaleString('fa-IR')}؛ نسخه: {value.revision}</p>
    {value.alert==='low'||value.alert==='zero'?<p role="alert">{value.alert==='zero'?'موجودی صفر است.':'موجودی به حد کمبود ذخیره‌شده رسیده است.'}</p>:value.alert==='invalid'?<p role="alert">موجودی معتبر نیست؛ هشدار کمبود قابل محاسبه نیست.</p>:value.alert==='unset'?<p>هشدار ذخیره‌شدهٔ این تنوع غیرفعال است.</p>:<p>موجودی بالاتر از حد کمبود ذخیره‌شده است.</p>}
    {!value.saleEnabled&&<p>محصول پیش‌نویس یا ناموجود است؛ هشدار عددی به معنی مجازبودن فروش نیست.</p>}
    {!value.writesEnabled&&<p>تغییر حد کمبود هنوز فعال نشده است.</p>}
    {!receipt&&!target&&value.writesEnabled&&<><label>حد کمبود جدید<Input aria-label="حد کمبود ذخیره‌شده جدید" disabled={disabled} inputMode="numeric" value={text} onChange={e=>setText(e.target.value)}/></label><label className="block"><input type="checkbox" checked={disabled} onChange={e=>setDisabled(e.target.checked)}/> غیرفعال‌کردن هشدار این تنوع</label><label>دلیل تغییر حد<Input aria-label="دلیل تغییر حد کمبود" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label><Button onClick={()=>{try{setTarget(preparePolicy(row.productId,row.variantId!,value.revision,text,disabled,reason,crypto.randomUUID()));setError('');}catch(failure){setError(failure instanceof Error?failure.message:'تنظیم معتبر نیست.');}}}>پیش‌نمایش حد کمبود</Button></>}
   </>:null}
   {target&&!receipt&&<div className="border rounded p-3 space-y-2"><p>حد پیشنهادی: {target.threshold===null?'غیرفعال':target.threshold}؛ نسخهٔ بازبینی‌شده: {target.expectedRevision}</p><p>دلیل: {target.reason}</p><p dir="ltr" className="break-all text-xs">{target.idempotencyKey}</p><Button disabled={busy} onClick={()=>void save()}>{busy?'در حال بررسی تنظیم…':pending?'بررسی دوبارهٔ همین تنظیم':'تأیید و ذخیرهٔ حد کمبود'}</Button>{!pending&&<Button variant="outline" onClick={()=>setTarget(undefined)}>ویرایش پیش‌نمایش حد</Button>}{pending&&<p>درخواست فقط در همین پنجره نگه داشته شده است. با بستن و بازکردن پنجره، تنظیم فعلی از سرور خوانده می‌شود؛ تکرار خودکار انجام نمی‌شود.</p>}</div>}
   {receipt&&<p role="status">ذخیرهٔ حد کمبود تأیید شد؛ نسخهٔ {receipt.revision}، حد {receipt.threshold===null?'غیرفعال':receipt.threshold}.</p>}
   {error&&<p role="alert">{error}</p>}
   <Button variant="outline" disabled={busy} onClick={close}>بستن حد کمبود</Button>
  </div></DialogContent></Dialog>;
}
