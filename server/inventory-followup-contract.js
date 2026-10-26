import {inventoryUuid,inventoryTimestamp,inventoryHistoryRequest} from './inventory-contract.js';
const states=['open','in_progress','reviewed'];
const int=(v,min=0,max=2147483647)=>Number.isInteger(v)&&v>=min&&v<=max;
const reason=v=>typeof v==='string'&&v.trim().length>=3&&v.trim().length<=500&&!/[\x00-\x1f\x7f]/.test(v);
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function followupHistoryRequest(v){const q=inventoryHistoryRequest(v);if(q.before&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(q.before))throw Error('Invalid cursor');return q;}
export function followupRequest(v){
 const keys=['productId','variantId','inventoryRevision','policyRevision','expectedRevision','status','reason','idempotencyKey'];
 if(!v||Array.isArray(v)||Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k))||!['productId','variantId','inventoryRevision','idempotencyKey'].every(k=>inventoryUuid(v[k]))||!int(v.policyRevision,1)||!int(v.expectedRevision,0,2147483646)||!states.includes(v.status)||!reason(v.reason))throw Error('Invalid followup');
 const body=pick(v,keys);for(const k of ['productId','variantId','inventoryRevision','idempotencyKey'])body[k]=body[k].toLowerCase();body.reason=body.reason.trim();return body;
}
export function followupRead(v,product,variant){
 if(!v||v.version!==1||v.productId!==product||v.variantId!==variant||!int(v.policyRevision,1)||!int(v.revision)||typeof v.hasEntity!=='boolean'||typeof v.contextChanged!=='boolean'||typeof v.canWrite!=='boolean'||!states.includes(v.status)||(v.threshold!==null&&!int(v.threshold,0,100000))||(v.quantity!==null&&!int(v.quantity))||(v.hasEntity?!inventoryUuid(v.inventoryRevision):v.inventoryRevision!==null))throw Error('Invalid followup context');
 const alert=v.threshold===null?'none':!v.hasEntity?'missing':v.quantity===null?'invalid':v.quantity===0?'zero':v.quantity<=v.threshold?'low':'none';
 if(v.alert!==alert||(v.canWrite&&!['low','zero','invalid'].includes(alert))||(v.revision===0?(v.lastStatus!==null||v.updatedBy!==null||v.lastRequestId!==null||v.updatedAt!==null||v.contextChanged||v.status!=='open'):(!states.includes(v.lastStatus)||!inventoryUuid(v.updatedBy)||!inventoryUuid(v.lastRequestId)||!inventoryTimestamp(v.updatedAt)))||((v.contextChanged||['none','missing'].includes(alert))?v.status!=='open':v.revision>0&&v.status!==v.lastStatus))throw Error('Incoherent followup context');
 return pick(v,['version','productId','variantId','policyRevision','inventoryRevision','quantity','threshold','alert','hasEntity','revision','status','lastStatus','contextChanged','updatedBy','lastRequestId','updatedAt','canWrite']);
}
export function followupEntry(v){
 if(!v||!['id','productId','variantId','actorId','requestId','inventoryRevision'].every(k=>inventoryUuid(v[k]))||!int(v.revision,1)||!int(v.policyRevision,1)||!states.includes(v.status)||!states.includes(v.beforeStatus)||!reason(v.reason)||v.reason!==v.reason.trim()||!inventoryTimestamp(v.createdAt)||(v.quantity!==null&&!int(v.quantity))||!int(v.threshold,0,100000)||(v.quantity!==null&&v.quantity>v.threshold))throw Error('Invalid followup entry');
 return pick(v,['id','productId','variantId','actorId','requestId','inventoryRevision','revision','policyRevision','status','beforeStatus','reason','quantity','threshold','createdAt']);
}
export function followupReceipt(v,actor,body){
 const entry=followupEntry(v);
 if(entry.actorId!==actor||entry.productId!==body.productId||entry.variantId!==body.variantId||entry.requestId!==body.idempotencyKey||entry.inventoryRevision!==body.inventoryRevision||entry.policyRevision!==body.policyRevision||entry.revision!==body.expectedRevision+1||entry.status!==body.status||entry.reason!==body.reason)throw Error('Wrong confirmation');return entry;
}
export function followupHistory(v,q){
 if(!v||!Array.isArray(v.entries)||v.entries.length>20||typeof v.hasMore!=='boolean'||(v.hasMore&&v.entries.length!==20))throw Error('Invalid history');
 const entries=v.entries.map(followupEntry);if(new Set(entries.map(e=>e.id)).size!==entries.length||entries.some(e=>e.productId!==q.productId||e.variantId!==q.variantId))throw Error('Wrong history');
 // Preserve PostgreSQL microseconds in both ordering and the next-page cursor.
 const tuple=e=>[e.createdAt,e.id];const less=(a,b)=>a[0]<b[0]||(a[0]===b[0]&&a[1]<b[1]);
 if(entries.some((e,i)=>!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(e.createdAt)||(i>0&&!less(tuple(e),tuple(entries[i-1])))||(q.before&&!less(tuple(e),[q.before,q.beforeId]))))throw Error('Unordered history');
 const last=entries.at(-1);return{entries,hasMore:v.hasMore,nextCursor:v.hasMore?{before:last.createdAt,beforeId:last.id}:null};
}
