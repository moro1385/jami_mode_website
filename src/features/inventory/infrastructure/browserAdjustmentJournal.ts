import {adjustmentUuid,validateAdjustment,type AdjustmentTarget} from '../domain/adjustments';
export function createAdjustmentJournal(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,project:string){
 if(!project||project.length>253)throw Error('فضای گزارش اصلاح معتبر نیست.');
 const key=(owner:string,product:string,variant:string)=>{if(![owner,product,variant].every(adjustmentUuid))throw Error('حساب یا انتخاب معتبر نیست.');return'jami-inventory-pending-v1:'+project+':'+owner.toLowerCase()+':'+product.toLowerCase()+':'+variant.toLowerCase();};
 function read(owner:string,product:string,variant:string){
  const raw=storage.getItem(key(owner,product,variant));if(raw===null)return;
  if(raw.length>10000)throw Error('یادداشت اصلاح معتبر نیست؛ دادهٔ قبلی حفظ شد.');
  const saved=JSON.parse(raw);if(saved.version!==1)throw Error('نسخهٔ یادداشت اصلاح معتبر نیست.');const target=validateAdjustment(saved.request);
  if(target.productId!==product.toLowerCase()||target.variantId!==variant.toLowerCase())throw Error('انتخاب یادداشت با این تنوع یکسان نیست.');return target;
 }
 return{key,read,save(owner:string,target:AdjustmentTarget){
  const valid=validateAdjustment(target),previous=read(owner,valid.productId,valid.variantId);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(valid))throw Error('این تنوع یک درخواست ناتمام دارد؛ همان درخواست را ابتدا بررسی کنید.');
  const value=JSON.stringify({version:1,request:valid});storage.setItem(key(owner,valid.productId,valid.variantId),value);
  if(storage.getItem(key(owner,valid.productId,valid.variantId))!==value)throw Error('ذخیرهٔ درخواست برای بازیابی تأیید نشد.');
 },clear(owner:string,target:AdjustmentTarget){
  const previous=read(owner,target.productId,target.variantId);if(!previous)return;
  if(JSON.stringify(previous)!==JSON.stringify(validateAdjustment(target)))throw Error('درخواست ناتمام دیگری حفظ شد.');
  storage.removeItem(key(owner,target.productId,target.variantId));if(storage.getItem(key(owner,target.productId,target.variantId))!==null)throw Error('بستن یادداشت تأیید نشد.');
 }};
}
