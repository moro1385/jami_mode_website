import {supabase} from '@/integrations/supabase/client';
import {adjustmentUuid} from '@/features/inventory/domain/adjustments';
import type {ErpPage,Operation,Resource} from '../domain/operations';
export class ErpError extends Error{constructor(public code:string){super(code);}}
export function createErpApi(client:Pick<typeof supabase,'auth'>,send:typeof fetch){
 async function request(owner:string,path:string,current:()=>boolean,body?:Operation){
  if(!current()||!adjustmentUuid(owner))throw Error('حساب تغییر کرده است.');const {data,error}=await client.auth.getSession();if(error||data.session?.user.id!==owner||!data.session.access_token||!current())throw Error('نشست معتبر نیست.');
  const res=await send('/api/admin/erp/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});const value=await res.json();if(!current())throw Error('حساب تغییر کرده است.');if(!res.ok)throw new ErpError(value?.code??'ERP_UNAVAILABLE');return value;
 }
 return{
  async list(owner:string,resource:Resource,after:string|null,parent:string|null,current:()=>boolean):Promise<ErpPage>{const v=await request(owner,'list?'+new URLSearchParams({resource,...(after?{after}:{}),...(parent?{parent}:{})}),current);if(!Array.isArray(v?.rows)||v.rows.length>50||typeof v.hasMore!=='boolean'||v.hasMore&&v.rows.length!==50)throw Error('فهرست تأیید نشد.');let prev=after??'',last=null;const chronological=['activity','operations'].includes(resource),ids=new Set();for(const r of v.rows){if(!adjustmentUuid(r.id)||ids.has(r.id)||(!chronological&&r.id<=prev))throw Error('ترتیب تأیید نشد.');if(chronological&&(typeof r.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(r.createdAt)||(last&&(r.createdAt>last.createdAt||r.createdAt===last.createdAt&&r.id>=last.id))))throw Error('ترتیب زمانی تأیید نشد.');ids.add(r.id);prev=r.id;last=r;}if(v.nextCursor!==(v.hasMore?prev:null))throw Error('ادامه تأیید نشد.');return v;},
  async save(owner:string,body:Operation,current:()=>boolean){const v=await request(owner,'operation',current,body);if(!v||v.actorId!==owner||v.requestId!==body.idempotencyKey||['resource','entityId','expected','next','reason','detail','amount'].some(k=>v[k]!==body[k])||!adjustmentUuid(v.id))throw Error('ثبت عملیات تأیید نشد.');return v;},
  async sales(owner:string,from:string,to:string,current:()=>boolean){const v=await request(owner,'sales?'+new URLSearchParams({from,to}),current);if(v?.currency!=='IRR'||!['paidTotal','paidOrders','shippingTotal','unpaidOrLegacy','recordedExternalRefunds'].every(k=>typeof v[k]==='string'&&/^\d+(\.\d{1,2})?$/.test(v[k]))||(v.grossProfit!==null&&(typeof v.grossProfit!=='string'||!/^[-]?\d+(\.\d{1,2})?$/.test(v.grossProfit)))||!Array.isArray(v.topProducts))throw Error('گزارش تأیید نشد.');return v;},
 };
}
export const erpApi=createErpApi(supabase,(path,init)=>fetch(path,init));
