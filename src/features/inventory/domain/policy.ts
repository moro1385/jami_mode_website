import {adjustmentUuid} from './adjustments';
import {lowStockThreshold} from './inventory';
export type PolicyTarget={productId:string;variantId:string;expectedRevision:number;threshold:number|null;reason:string;idempotencyKey:string};
export type PolicyValue={version:1;productId:string;variantId:string;revision:number;threshold:number|null;available:number|null;alert:'invalid'|'unset'|'zero'|'low'|'ok';saleEnabled:boolean;writesEnabled:boolean;updatedBy:string|null;lastRequestId:string|null;updatedAt:string|null};
export type PolicyReceipt={productId:string;variantId:string;revision:number;threshold:number|null;beforeThreshold:number|null;reason:string;actorId:string;requestId:string;createdAt:string};
const threshold=(v:unknown)=>v===null||(typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=100000);
const timestamp=(v:unknown)=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
export function preparePolicy(productId:string,variantId:string,revision:number,text:string,disabled:boolean,reason:string,key:string):PolicyTarget{
 if(![productId,variantId,key].every(adjustmentUuid)||!Number.isInteger(revision)||revision<0||revision>2147483646||reason.trim().length<3||reason.trim().length>500||[...reason].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))throw Error('انتخاب، نسخه یا دلیل تنظیم معتبر نیست.');
 return{productId,variantId,expectedRevision:revision,threshold:disabled?null:lowStockThreshold(text),reason:reason.trim(),idempotencyKey:key};
}
export function parsePolicy(value:unknown,product:string,variant:string):PolicyValue{
 const v=value as PolicyValue;
 if(!v||v.version!==1||v.productId!==product||v.variantId!==variant||![v.productId,v.variantId].every(adjustmentUuid)||!threshold(v.threshold)||!Number.isInteger(v.revision)||v.revision<0||v.revision>2147483647
  ||(v.available!==null&&(!Number.isInteger(v.available)||v.available<0||v.available>2147483647))||typeof v.saleEnabled!=='boolean'||typeof v.writesEnabled!=='boolean'
  ||(v.revision===0?(v.threshold!==null||v.updatedBy!==null||v.lastRequestId!==null||v.updatedAt!==null):(!adjustmentUuid(v.updatedBy)||!adjustmentUuid(v.lastRequestId)||!timestamp(v.updatedAt))))throw Error('تنظیم ذخیره‌شده تأیید نشد.');
 const state=v.available===null?'invalid':v.threshold===null?'unset':v.available===0?'zero':v.available<=v.threshold?'low':'ok';if(v.alert!==state)throw Error('هشدار موجودی تأیید نشد.');
 return Object.fromEntries(['version','productId','variantId','revision','threshold','available','alert','saleEnabled','writesEnabled','updatedBy','lastRequestId','updatedAt'].map(key=>[key,v[key as keyof PolicyValue]])) as PolicyValue;
}
export function parsePolicyReceipt(value:unknown,owner:string,target:PolicyTarget):PolicyReceipt{
 const v=value as PolicyReceipt;
 if(!v||v.productId!==target.productId||v.variantId!==target.variantId||v.actorId!==owner||v.requestId!==target.idempotencyKey||v.revision!==target.expectedRevision+1||v.threshold!==target.threshold||v.reason!==target.reason||!threshold(v.beforeThreshold)||!timestamp(v.createdAt))throw Error('ثبت تنظیم تأیید نشد.');
 return Object.fromEntries(['productId','variantId','revision','threshold','beforeThreshold','reason','actorId','requestId','createdAt'].map(key=>[key,v[key as keyof PolicyReceipt]])) as PolicyReceipt;
}
