import {adjustmentUuid} from './adjustments';
export type FollowupStatus='open'|'in_progress'|'reviewed';
export const followupLabels:Record<FollowupStatus,string>={open:'باز',in_progress:'در حال پیگیری',reviewed:'بازبینی‌شده'};
export type FollowupTarget={productId:string;variantId:string;inventoryRevision:string;policyRevision:number;expectedRevision:number;status:FollowupStatus;reason:string;idempotencyKey:string};
export type FollowupValue={version:1;productId:string;variantId:string;inventoryRevision:string|null;policyRevision:number;revision:number;status:FollowupStatus;lastStatus:FollowupStatus|null;quantity:number|null;threshold:number|null;alert:'none'|'missing'|'invalid'|'zero'|'low';hasEntity:boolean;contextChanged:boolean;canWrite:boolean;updatedBy:string|null;lastRequestId:string|null;updatedAt:string|null};
export type FollowupEntry={id:string;productId:string;variantId:string;actorId:string;requestId:string;inventoryRevision:string;policyRevision:number;revision:number;status:FollowupStatus;beforeStatus:FollowupStatus;reason:string;quantity:number|null;threshold:number;createdAt:string};
export type FollowupCursor={before:string;beforeId:string};
export type FollowupHistory={entries:FollowupEntry[];hasMore:boolean;nextCursor:FollowupCursor|null};
const int=(v:unknown,min=0,max=2147483647)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const state=(v:unknown)=>typeof v==='string'&&Object.prototype.hasOwnProperty.call(followupLabels,v);
const reason=(v:unknown)=>typeof v==='string'&&v.trim().length>=3&&v.trim().length<=500&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v)&&Number.isFinite(Date.parse(v));
export function parseFollowup(value:unknown,product:string,variant:string):FollowupValue{
 const v=value as FollowupValue;
 if(!v||v.version!==1||v.productId!==product||v.variantId!==variant||!int(v.policyRevision,1)||!int(v.revision)||!state(v.status)||typeof v.hasEntity!=='boolean'||typeof v.contextChanged!=='boolean'||typeof v.canWrite!=='boolean'||(v.threshold!==null&&!int(v.threshold,0,100000))||(v.quantity!==null&&!int(v.quantity))||(v.hasEntity?!adjustmentUuid(v.inventoryRevision):v.inventoryRevision!==null))throw Error('وضعیت پیگیری تأیید نشد.');
 const alert=v.threshold===null?'none':!v.hasEntity?'missing':v.quantity===null?'invalid':v.quantity===0?'zero':v.quantity<=v.threshold?'low':'none';
 if(v.alert!==alert||(v.canWrite&&!['low','zero','invalid'].includes(alert))||(v.revision===0?(v.lastStatus!==null||v.updatedBy!==null||v.lastRequestId!==null||v.updatedAt!==null||v.contextChanged||v.status!=='open'):(!state(v.lastStatus)||!adjustmentUuid(v.updatedBy)||!adjustmentUuid(v.lastRequestId)||!timestamp(v.updatedAt)))||((v.contextChanged||['none','missing'].includes(alert))?v.status!=='open':v.revision>0&&v.status!==v.lastStatus))throw Error('وضعیت پیگیری ناسازگار است.');return v;
}
export function prepareFollowup(v:FollowupValue,status:FollowupStatus,note:string,key:string):FollowupTarget{
 if(!v.canWrite||!v.hasEntity||!adjustmentUuid(v.inventoryRevision)||![v.productId,v.variantId,key].every(adjustmentUuid)||!int(v.policyRevision,1)||!int(v.revision,0,2147483646)||!state(status)||!reason(note))throw Error('وضعیت یا دلیل پیگیری معتبر نیست؛ دلیل باید ۳ تا ۵۰۰ نویسه باشد.');
 return{productId:v.productId,variantId:v.variantId,inventoryRevision:v.inventoryRevision,policyRevision:v.policyRevision,expectedRevision:v.revision,status,reason:note.trim(),idempotencyKey:key};
}
export function parseFollowupEntry(value:unknown):FollowupEntry{
 const v=value as FollowupEntry;
 if(!v||![v.id,v.productId,v.variantId,v.actorId,v.requestId,v.inventoryRevision].every(adjustmentUuid)||!int(v.policyRevision,1)||!int(v.revision,1)||!state(v.status)||!state(v.beforeStatus)||!reason(v.reason)||v.reason!==v.reason.trim()||!timestamp(v.createdAt)||!int(v.threshold,0,100000)||(v.quantity!==null&&(!int(v.quantity)||v.quantity>v.threshold)))throw Error('رسید پیگیری تأیید نشد.');return v;
}
export function parseFollowupReceipt(value:unknown,owner:string,target:FollowupTarget):FollowupEntry{
 const v=parseFollowupEntry(value);if(v.actorId!==owner||v.requestId!==target.idempotencyKey||v.productId!==target.productId||v.variantId!==target.variantId||v.inventoryRevision!==target.inventoryRevision||v.policyRevision!==target.policyRevision||v.revision!==target.expectedRevision+1||v.status!==target.status||v.reason!==target.reason)throw Error('رسید متعلق به این پیگیری نیست.');return v;
}
export function parseFollowupHistory(value:unknown,product:string,variant:string,cursor:FollowupCursor|null):FollowupHistory{
 const v=value as FollowupHistory;if(!v||!Array.isArray(v.entries)||v.entries.length>20||typeof v.hasMore!=='boolean'||(v.hasMore&&v.entries.length!==20))throw Error('سابقهٔ پیگیری تأیید نشد.');
 const entries=v.entries.map(parseFollowupEntry),less=(a:FollowupEntry,b:{createdAt:string;id:string})=>a.createdAt<b.createdAt||(a.createdAt===b.createdAt&&a.id<b.id);
 if(new Set(entries.map(e=>e.id)).size!==entries.length||entries.some((e,i)=>e.productId!==product||e.variantId!==variant||(i>0&&!less(e,entries[i-1]))||(cursor&&!less(e,{createdAt:cursor.before,id:cursor.beforeId}))))throw Error('ترتیب سابقهٔ پیگیری تأیید نشد.');
 const last=entries.at(-1),expected=v.hasMore?{before:last!.createdAt,beforeId:last!.id}:null;if(JSON.stringify(v.nextCursor)!==JSON.stringify(expected))throw Error('صفحهٔ بعدی سابقه تأیید نشد.');return{entries,hasMore:v.hasMore,nextCursor:expected};
}
