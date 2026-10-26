import {Router} from 'express';
import {createClient} from '@supabase/supabase-js';
import {inventoryUuid,inventoryTimestamp} from './inventory-contract.js';
export const erpResources=['costs','orders','returns','customers','addresses','tickets','messages','activity','operations'];
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}};
const client=()=>createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',options);
async function authenticate(header){
 if(typeof header!=='string'||!header.startsWith('Bearer ')||header.length>16384)return null;
 const c=createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_ANON_KEY??'',{...options,global:{...options.global,headers:{Authorization:header}}});const {data,error}=await c.auth.getUser();if(error||!inventoryUuid(data?.user?.id))return null;
 const role=await c.rpc('has_role',{_user_id:data.user.id,_role:'admin'});if(role.error)throw Error();return{user:data.user,admin:role.data===true};
}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const clean=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
export function operationRequest(v){
 const keys=['resource','entityId','expected','next','reason','detail','amount','idempotencyKey'];
 if(!exact(v,keys)||!['order','return','refund','ticket','cost'].includes(v.resource)||![v.entityId,v.idempotencyKey].every(inventoryUuid)||!clean(v.expected,1,100)||!clean(v.next,1,40)||!clean(v.reason,3,500)||(v.detail!==null&&!clean(v.detail,1,200))||(v.resource==='refund'?!Number.isSafeInteger(v.amount)||v.amount<1:v.resource==='cost'?!Number.isSafeInteger(v.amount)||v.amount<0||v.amount>99999999:v.amount!==null))throw Error();return{...v,entityId:v.entityId.toLowerCase(),idempotencyKey:v.idempotencyKey.toLowerCase(),reason:v.reason.trim()};
}
const projection={costs:['id','orderId','quantity','salePrice','unitCost','revision'],orders:['id','status','paymentState','amount','createdAt','refundState','refundRevision','refundAmount'],returns:['id','orderId','status','revision','createdAt'],customers:['id','firstName','lastName','phone','createdAt'],addresses:['id','recipient','city','line1','postalCode'],tickets:['id','subject','status','message','createdAt'],messages:['id','userId','title','body','isRead','createdAt'],activity:['id','actorId','resource','entityId','action','changedFields','beforeValues','afterValues','createdAt'],operations:['id','actorId','requestId','resource','entityId','expected','before','next','reason','detail','amount','revision','createdAt']};
export function erpPage(value,after,resource){
 if(!value||!Array.isArray(value.rows)||value.rows.length>50||typeof value.hasMore!=='boolean'||value.hasMore&&value.rows.length!==50)throw Error();let previous=after??'';
 const chronological=['activity','operations'].includes(resource);let last=null;const ids=new Set();for(const row of value.rows){if(!row||!inventoryUuid(row.id)||row.id!==row.id.toLowerCase()||ids.has(row.id)||(!chronological&&row.id<=previous))throw Error();if(chronological&&(!inventoryTimestamp(row.createdAt)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(row.createdAt)||(last&&(row.createdAt>last.createdAt||row.createdAt===last.createdAt&&row.id>=last.id))))throw Error();ids.add(row.id);previous=row.id;last=row;}
 const keys=projection[resource];const rows=keys?value.rows.map(row=>{if(!keys.every(k=>Object.hasOwn(row,k)))throw Error();return Object.fromEntries(keys.map(k=>[k,row[k]]));}):value.rows;return{rows,hasMore:value.hasMore,nextCursor:value.hasMore?value.rows.at(-1).id:null};
}
export function erpReceipt(v,id,body){if(!v||!inventoryUuid(v.id)||v.actorId!==id||v.requestId!==body.idempotencyKey||!inventoryTimestamp(v.createdAt)||['resource','entityId','expected','next','reason','detail'].some(k=>v[k]!==body[k])||v.amount!==body.amount)throw Error();return v;}
export function reportValue(v){if(!v||v.currency!=='IRR'||!['paidOrders','paidTotal','shippingTotal','unpaidOrLegacy','recordedExternalRefunds'].every(k=>typeof v[k]==='string'&&/^\d+(\.\d{1,2})?$/.test(v[k]))||(v.grossProfit===null?v.profitUnavailableReason!=='purchase-cost-snapshots-unavailable':typeof v.grossProfit!=='string'||!/^[-]?\d+(\.\d{1,2})?$/.test(v.grossProfit)||v.profitUnavailableReason!==null)||!Array.isArray(v.topProducts)||v.topProducts.length>20)throw Error();return v;}
export function csvCell(value){const s=String(value??'');return '"'+(/^[\s]*[=+\-@\t\r\n]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
export function createErpRouter({auth=authenticate,admin=client,enabled=process.env.JAMI_ERP_ENABLED==='true'}={}){
 const router=Router();const actor=async(req,res)=>{res.set('Cache-Control','no-store');const identity=await auth(req.headers.authorization);if(!inventoryUuid(identity?.user?.id)){res.status(401).json({code:'UNAUTHORIZED'});return null;}if(identity.admin!==true){res.status(403).json({code:'ADMIN_REQUIRED'});return null;}if(!enabled){res.status(503).json({code:'ERP_SERVER_DISABLED'});return null;}return identity.user.id.toLowerCase();};
 router.get('/list',async(req,res)=>{try{const id=await actor(req,res);if(!id)return;const q=req.query??{};if(Object.keys(q).some(k=>!['resource','after','parent'].includes(k))||!erpResources.includes(q.resource)||(q.after!==undefined&&!inventoryUuid(q.after))||(q.resource==='addresses'?!inventoryUuid(q.parent):['activity','operations'].includes(q.resource)?q.parent!==undefined&&!inventoryUuid(q.parent):q.parent!==undefined))return res.status(400).json({code:'ERP_INVALID'});
  const {data,error}=await admin().rpc('trusted_erp_list',{p_actor:id,p_resource:q.resource,p_after:q.after?.toLowerCase()??null,p_parent:q.parent?.toLowerCase()??null});if(error)throw Error();return res.status(200).json(erpPage(data,q.after,q.resource));
 }catch{return res.status(503).json({code:'ERP_READ_UNAVAILABLE'});}});
 router.post('/operation',async(req,res)=>{try{const id=await actor(req,res);if(!id)return;let body;try{if(Object.keys(req.query??{}).length)throw Error();body=operationRequest(req.body);}catch{return res.status(400).json({code:'ERP_INVALID'});}
  const {data,error}=await admin().rpc('trusted_erp_operation',{p_actor:id,p_key:body.idempotencyKey,p_resource:body.resource,p_entity:body.entityId,p_expected:body.expected,p_next:body.next,p_reason:body.reason,p_detail:body.detail,p_amount:body.amount});
  if(error){const codes={ERP_STALE:409,ERP_CONFLICT:409,ERP_TRANSITION:409,ERP_PAYMENT_REVIEW:409,ERP_DISABLED:503,ERP_INVALID:400,ERP_NOT_FOUND:404,INVENTORY_FORBIDDEN:403};if(error.code==='P0001'&&Object.hasOwn(codes,error.message))return res.status(codes[error.message]).json({code:error.message});throw Error();}return res.status(200).json(erpReceipt(data,id,body));
 }catch{return res.status(503).json({code:'ERP_RESULT_UNCONFIRMED'});}});
 router.get('/sales',async(req,res)=>{try{const id=await actor(req,res);if(!id)return;const q=req.query??{};if(!exact(q,['from','to'])||!inventoryTimestamp(q.from)||!inventoryTimestamp(q.to)||Date.parse(q.to)<=Date.parse(q.from)||Date.parse(q.to)-Date.parse(q.from)>366*86400000)return res.status(400).json({code:'ERP_INVALID'});
  const {data,error}=await admin().rpc('trusted_erp_sales',{p_actor:id,p_from:q.from,p_to:q.to});if(error)throw Error();return res.status(200).json(reportValue(data));
 }catch{return res.status(503).json({code:'ERP_REPORT_UNAVAILABLE'});}});
 return router;
}
export default createErpRouter();
