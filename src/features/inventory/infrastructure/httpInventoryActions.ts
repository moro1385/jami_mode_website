import type {InventoryActions,InventoryCursor} from '../application/inventoryActions';
import {adjustmentUuid,validateAdjustment,parseAdjustmentEntry,type AdjustmentTarget} from '../domain/adjustments';
import type {createAdjustmentJournal} from './browserAdjustmentJournal';
type SessionClient={auth:{getSession():Promise<{data:{session:{user:{id:string};access_token:string}|null};error:unknown}>}};
export type InventoryLock=<T>(name:string,work:()=>Promise<T>)=>Promise<T>;
export class InventoryActionError extends Error {constructor(public code:string){super(code);}}
export function createHttpInventoryActions(client:SessionClient,send:typeof fetch,journal:ReturnType<typeof createAdjustmentJournal>,lock:InventoryLock):InventoryActions{
 async function request(owner:string,path:string,current:()=>boolean,body?:AdjustmentTarget){
  if(!current()||!adjustmentUuid(owner))throw Error('حساب تغییر کرده است.');const {data,error}=await client.auth.getSession();
  if(error||data.session?.user.id!==owner||!data.session.access_token||!current())throw Error('نشست حساب معتبر نیست.');
  const response=await send('/api/admin/inventory/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)throw new InventoryActionError(typeof value?.code==='string'?value.code:'INVENTORY_RESULT_UNCONFIRMED');return value;
 }
 return{pending:journal.read,async status(owner,current){const value=await request(owner,'status',current);if(typeof value?.adjustmentsEnabled!=='boolean'||typeof value.historyAvailable!=='boolean')throw Error('وضعیت قابلیت تأیید نشد.');return{adjustmentsEnabled:value.adjustmentsEnabled,historyAvailable:value.historyAvailable};},
 async adjust(owner,input,current){const target=validateAdjustment(input);return lock(journal.key(owner,target.productId,target.variantId),async()=>{
  if(!current())throw Error('حساب تغییر کرده است.');journal.save(owner,target);
  let value;try{value=await request(owner,'adjustments',current,target);}catch(error){if(error instanceof InventoryActionError&&error.code==='INVENTORY_STALE')journal.clear(owner,target);throw error;}
  const entry=parseAdjustmentEntry(value?.entry);
  if(entry.actorId!==owner||entry.productId!==target.productId||entry.variantId!==target.variantId||entry.requestId!==target.idempotencyKey||entry.before!==target.expected.quantity||entry.delta!==target.delta||entry.reason!==target.reason||['sku','size','color'].some(key=>entry[key]!==target.expected[key]))throw Error('نتیجهٔ ثبت با درخواست یکسان نیست.');
  let recoveryWarning=false;try{journal.clear(owner,target);}catch{recoveryWarning=true;}return{entry,recoveryWarning};
 });},
 async history(owner,product,variant,cursor,current){
  if(!adjustmentUuid(product)||!adjustmentUuid(variant))throw Error('انتخاب معتبر نیست.');
  const query=new URLSearchParams({productId:product,variantId:variant,...(cursor?{before:cursor.before,beforeId:cursor.beforeId}:{})});const value=await request(owner,'history?'+query,current);
  if(!Array.isArray(value?.entries)||value.entries.length>20||typeof value.hasMore!=='boolean')throw Error('تاریخچه تأیید نشد.');const entries=value.entries.map(parseAdjustmentEntry);
  if(new Set(entries.map(entry=>entry.id)).size!==entries.length||entries.some(entry=>entry.productId!==product||entry.variantId!==variant)||(value.hasMore&&!entries.length))throw Error('تاریخچه با انتخاب یکسان نیست.');
  const last=entries.at(-1),nextCursor:InventoryCursor|null=value.hasMore?{before:last.createdAt,beforeId:last.id}:null;
  if(JSON.stringify(value.nextCursor)!==JSON.stringify(nextCursor))throw Error('ادامهٔ تاریخچه تأیید نشد.');return{entries,hasMore:value.hasMore,nextCursor};
 }};
}
