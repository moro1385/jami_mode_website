import {inventoryUuid,inventoryTimestamp} from './inventory-contract.js';
import {followupRead,followupHistoryRequest} from './inventory-followup-contract.js';
export const assignmentHistoryRequest=followupHistoryRequest;
const int=(v,min=0,max=2147483647)=>Number.isInteger(v)&&v>=min&&v<=max;
const nullable=v=>v===null||inventoryUuid(v);
const name=v=>v===null||typeof v==='string'&&v.trim().length>0&&v.length<=200;
const reason=v=>typeof v==='string'&&v.trim().length>=3&&v.trim().length<=500&&!/[\x00-\x1f\x7f]/.test(v);
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function assignmentRequest(v){
 const keys=['productId','variantId','inventoryRevision','policyRevision','expectedRevision','assigneeId','reason','idempotencyKey'];
 if(!v||Array.isArray(v)||Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k))||!['productId','variantId','inventoryRevision','idempotencyKey'].every(k=>inventoryUuid(v[k]))||!int(v.policyRevision,1)||!int(v.expectedRevision,0,2147483646)||!nullable(v.assigneeId)||!reason(v.reason))throw Error('Invalid assignment');
 const result=pick(v,keys);for(const k of ['productId','variantId','inventoryRevision','idempotencyKey'])result[k]=result[k].toLowerCase();result.assigneeId=result.assigneeId?.toLowerCase()??null;result.reason=result.reason.trim();return result;
}
export function assignmentRead(v,product,variant){
 const context=followupRead(v?.context,product,variant);
 if(!int(v.revision)||!nullable(v.assigneeId)||!name(v.assigneeName)||typeof v.assigneeActive!=='boolean'||(!v.assigneeId&&(v.assigneeActive||v.assigneeName!==null))||(!v.assigneeActive&&v.assigneeName!==null)||typeof v.canWrite!=='boolean'||(v.canWrite&&(!context.hasEntity||!['low','zero','invalid'].includes(context.alert)))||(v.revision===0?(v.assigneeId!==null||v.updatedBy!==null||v.lastRequestId!==null||v.updatedAt!==null):(!inventoryUuid(v.updatedBy)||!inventoryUuid(v.lastRequestId)||!inventoryTimestamp(v.updatedAt))))throw Error('Invalid assignment state');
 return{...pick(v,['revision','assigneeId','assigneeName','assigneeActive','updatedBy','lastRequestId','updatedAt','canWrite']),context};
}
export function assignmentEntry(v){
 if(!v||!['id','productId','variantId','actorId','requestId','inventoryRevision'].every(k=>inventoryUuid(v[k]))||!int(v.revision,1)||!int(v.policyRevision,1)||!nullable(v.assigneeId)||!nullable(v.beforeAssigneeId)||v.assigneeId===v.beforeAssigneeId||!reason(v.reason)||v.reason!==v.reason.trim()||!inventoryTimestamp(v.createdAt))throw Error('Invalid assignment receipt');return pick(v,['id','productId','variantId','actorId','requestId','inventoryRevision','policyRevision','revision','assigneeId','beforeAssigneeId','reason','createdAt']);
}
export function assignmentReceipt(v,actor,body){const entry=assignmentEntry(v);if(entry.actorId!==actor||entry.productId!==body.productId||entry.variantId!==body.variantId||entry.requestId!==body.idempotencyKey||entry.inventoryRevision!==body.inventoryRevision||entry.policyRevision!==body.policyRevision||entry.revision!==body.expectedRevision+1||entry.assigneeId!==body.assigneeId||entry.reason!==body.reason)throw Error('Wrong assignment confirmation');return entry;}
export function assigneeQuery(q){if(!q||Object.keys(q).some(k=>k!=='after')||(q.after!==undefined&&!inventoryUuid(q.after)))throw Error('Invalid assignee cursor');return q.after?.toLowerCase()??null;}
export function assigneePage(v,after){
 if(!v||!Array.isArray(v.rows)||v.rows.length>50||typeof v.hasMore!=='boolean'||v.hasMore&&v.rows.length!==50)throw Error('Invalid assignee list');let previous=after??'';
 const rows=v.rows.map(row=>{if(!row||!inventoryUuid(row.id)||row.id!==row.id.toLowerCase()||row.id<=previous||!name(row.name))throw Error('Invalid assignee row');previous=row.id;return{id:row.id,name:row.name};});return{rows,hasMore:v.hasMore,nextCursor:v.hasMore?rows.at(-1).id:null};
}
export function assignmentHistory(v,q){
 if(!v||!Array.isArray(v.entries)||v.entries.length>20||typeof v.hasMore!=='boolean'||v.hasMore&&v.entries.length!==20)throw Error('Invalid assignment history');const entries=v.entries.map(assignmentEntry);const less=(a,b)=>a.createdAt<b.createdAt||a.createdAt===b.createdAt&&a.id<b.id;
 if(new Set(entries.map(e=>e.id)).size!==entries.length||entries.some((e,i)=>e.productId!==q.productId||e.variantId!==q.variantId||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(e.createdAt)||i>0&&!less(e,entries[i-1])||q.before&&!less(e,{createdAt:q.before,id:q.beforeId})))throw Error('Unordered assignment history');const last=entries.at(-1);return{entries,hasMore:v.hasMore,nextCursor:v.hasMore?{before:last.createdAt,beforeId:last.id}:null};
}
