import {assignmentRequest,assignmentRead,assignmentReceipt,assignmentHistoryRequest,assignmentHistory,assigneeQuery,assigneePage} from './inventory-assignment-contract.js';
import {followupRequest,followupRead,followupReceipt,followupHistoryRequest,followupHistory} from './inventory-followup-contract.js';
import {alertQueueRequest,alertQueueResult} from './inventory-alert-contract.js';
import {policyRequest,policyRead,policyReceipt} from './inventory-policy-contract.js';
import {inventoryBalanceResult} from './inventory-balance-contract.js';
import {Router} from 'express';
import {createClient} from '@supabase/supabase-js';
import {inventoryUuid,inventoryAdjustmentRequest,inventoryAdjustmentEntry,inventoryHistoryRequest} from './inventory-contract.js';
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}};
const serviceClient=()=>createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'',options);
async function authenticate(header){
 if(typeof header!=='string'||!header.startsWith('Bearer ')||header.length>16384)return null;
 const client=createClient(process.env.SUPABASE_URL??'',process.env.SUPABASE_ANON_KEY??'',{...options,global:{...options.global,headers:{Authorization:header}}});
 const {data,error}=await client.auth.getUser();if(error||!inventoryUuid(data?.user?.id))return null;
 const role=await client.rpc('has_role',{_user_id:data.user.id,_role:'admin'});if(role.error)throw Error('Role check unavailable');
 return{user:data.user,admin:role.data===true};
}
// Disabled until the separately reviewed database implementation and rollout are ready.
export function createInventoryRouter({auth=authenticate,admin=serviceClient,enabled=process.env.JAMI_INVENTORY_ADJUSTMENTS_ENABLED==='true',reportsEnabled=process.env.JAMI_INVENTORY_REPORTS_ENABLED==='true',policiesEnabled=process.env.JAMI_INVENTORY_POLICIES_ENABLED==='true',followupsEnabled=process.env.JAMI_INVENTORY_FOLLOWUPS_ENABLED==='true',assignmentsEnabled=process.env.JAMI_INVENTORY_ASSIGNMENTS_ENABLED==='true'}={}){
 const router=Router();
 const actor=async(req,res)=>{
  res.set('Cache-Control','no-store');const identity=await auth(req.headers.authorization);
  if(!inventoryUuid(identity?.user?.id)){res.status(401).json({code:'UNAUTHORIZED'});return null;}
  if(identity.admin!==true){res.status(403).json({code:'ADMIN_REQUIRED'});return null;}
  return identity.user.id.toLowerCase();
 };
 router.get('/status',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(Object.keys(req.query??{}).length)return res.status(400).json({code:'INVALID_INVENTORY_REQUEST'});
   if(!enabled)return res.status(200).json({version:null,adjustmentsEnabled:false,historyAvailable:false});
   const {data,error}=await admin().rpc('trusted_inventory_status',{p_actor:id});
   if(error||data?.version!==1||typeof data.adjustmentsEnabled!=='boolean')throw Error('Unavailable');
   return res.status(200).json({version:1,adjustmentsEnabled:data.adjustmentsEnabled,historyAvailable:true});
  }catch{return res.status(503).json({code:'INVENTORY_UNAVAILABLE'});}
 });
 router.post('/adjustments',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!enabled)return res.status(503).json({code:'INVENTORY_ADJUSTMENTS_DISABLED'});
   let body;try{if(Object.keys(req.query??{}).length)throw Error();body=inventoryAdjustmentRequest(req.body);}catch{return res.status(400).json({code:'INVALID_INVENTORY_REQUEST'});}
   const {data,error}=await admin().rpc('trusted_inventory_adjust',{p_actor:id,p_key:body.idempotencyKey,p_product:body.productId,p_variant:body.variantId,p_expected:body.expected,p_delta:body.delta,p_reason:body.reason});
   if(error){
    const codes={INVENTORY_STALE:409,INVENTORY_REQUEST_CONFLICT:409,INVENTORY_FORBIDDEN:403,INVENTORY_DISABLED:503,INVENTORY_NOT_FOUND:404,INVENTORY_INVALID:400};
    if(error.code==='P0001'&&Object.hasOwn(codes,error.message))return res.status(codes[error.message]).json({code:error.message});
    throw Error('Unconfirmed');
   }
   const entry=inventoryAdjustmentEntry(data);
   if(entry.actorId!==id||entry.productId!==body.productId||entry.variantId!==body.variantId||entry.requestId!==body.idempotencyKey||entry.before!==body.expected.quantity||entry.delta!==body.delta||entry.reason!==body.reason||['sku','size','color'].some(key=>entry[key]!==body.expected[key]))throw Error('Wrong confirmation');
   return res.status(200).json({entry});
  }catch{return res.status(503).json({code:'INVENTORY_RESULT_UNCONFIRMED'});}
 });
 router.get('/history',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!enabled)return res.status(503).json({code:'INVENTORY_ADJUSTMENTS_DISABLED'});
   let query;try{query=inventoryHistoryRequest(req.query??{});}catch{return res.status(400).json({code:'INVALID_INVENTORY_REQUEST'});}
   const {data,error}=await admin().rpc('trusted_inventory_history',{p_actor:id,p_product:query.productId,p_variant:query.variantId,p_before:query.before,p_before_id:query.beforeId,p_limit:20});
   if(error||!Array.isArray(data?.entries)||data.entries.length>20||typeof data.hasMore!=='boolean'||(data.hasMore&&!data.entries.length))throw Error('Unavailable');
   const entries=data.entries.map(inventoryAdjustmentEntry);
   if(new Set(entries.map(entry=>entry.id)).size!==entries.length||entries.some(entry=>entry.productId!==query.productId||entry.variantId!==query.variantId))throw Error('Wrong history');
   const last=entries.at(-1);return res.status(200).json({entries,hasMore:data.hasMore,nextCursor:data.hasMore?{before:last.createdAt,beforeId:last.id}:null});
  }catch{return res.status(503).json({code:'INVENTORY_HISTORY_UNAVAILABLE'});}
 });
 router.get('/balance',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!reportsEnabled)return res.status(503).json({code:'INVENTORY_REPORTS_DISABLED'});
   const query=req.query??{};
   if(Object.keys(query).length!==2||!inventoryUuid(query.productId)||!inventoryUuid(query.variantId))return res.status(400).json({code:'INVALID_INVENTORY_REQUEST'});
   const product=query.productId.toLowerCase(),variant=query.variantId.toLowerCase();
   const {data,error}=await admin().rpc('trusted_inventory_balance',{p_actor:id,p_product:product,p_variant:variant});
   if(error){if(error.code==='P0001'&&error.message==='INVENTORY_NOT_FOUND')return res.status(404).json({code:'INVENTORY_NOT_FOUND'});throw Error('Unavailable');}
   return res.status(200).json(inventoryBalanceResult(data,product,variant));
  }catch{return res.status(503).json({code:'INVENTORY_REPORT_UNAVAILABLE'});}
 });
 router.get('/policy',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!policiesEnabled)return res.status(503).json({code:'POLICY_SERVER_DISABLED'});
   const q=req.query??{};if(Object.keys(q).length!==2||!inventoryUuid(q.productId)||!inventoryUuid(q.variantId))return res.status(400).json({code:'POLICY_INVALID'});
   const product=q.productId.toLowerCase(),variant=q.variantId.toLowerCase();const {data,error}=await admin().rpc('trusted_inventory_policy',{p_actor:id,p_product:product,p_variant:variant});
   if(error)throw Error();return res.status(200).json(policyRead(data,product,variant));
  }catch{return res.status(503).json({code:'POLICY_READ_UNAVAILABLE'});}
 });
 router.post('/policy',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!policiesEnabled)return res.status(503).json({code:'POLICY_SERVER_DISABLED'});
   let body;try{if(Object.keys(req.query??{}).length)throw Error();body=policyRequest(req.body);}catch{return res.status(400).json({code:'POLICY_INVALID'});}
   const {data,error}=await admin().rpc('trusted_inventory_policy_set',{p_actor:id,p_key:body.idempotencyKey,p_product:body.productId,p_variant:body.variantId,p_revision:body.expectedRevision,p_threshold:body.threshold,p_reason:body.reason});
   if(error){const codes={POLICY_STALE:409,POLICY_CONFLICT:409,POLICY_DISABLED:503,POLICY_NOT_FOUND:404,POLICY_INVALID:400,INVENTORY_FORBIDDEN:403};if(error.code==='P0001'&&Object.hasOwn(codes,error.message))return res.status(codes[error.message]).json({code:error.message});throw Error();}
   return res.status(200).json(policyReceipt(data,id,body));
  }catch{return res.status(503).json({code:'POLICY_RESULT_UNCONFIRMED'});}
 });
 router.get('/alerts',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!policiesEnabled)return res.status(503).json({code:'POLICY_SERVER_DISABLED'});
   let query;try{query=alertQueueRequest(req.query??{});}catch{return res.status(400).json({code:'ALERT_INVALID'});}
   if(query.followup!=='all'&&!followupsEnabled)return res.status(503).json({code:'FOLLOWUP_SERVER_DISABLED'});
   if(query.assignment!=='all'&&!assignmentsEnabled)return res.status(503).json({code:'ASSIGNMENT_SERVER_DISABLED'});
   const {data,error}=await admin().rpc(assignmentsEnabled?'trusted_inventory_alerts_assigned':followupsEnabled?'trusted_inventory_alerts_followup':'trusted_inventory_alerts',{p_actor:id,p_filter:query.filter,...(followupsEnabled||assignmentsEnabled?{p_followup:query.followup}:{}),...(assignmentsEnabled?{p_assignment:query.assignment}:{}),p_after_product:query.cursor?.productId??null,p_after_variant:query.cursor?.variantId??null,p_limit:50});
   if(error)throw Error();return res.status(200).json(alertQueueResult(data,{...query,withFollowup:followupsEnabled||assignmentsEnabled,withAssignment:assignmentsEnabled,actor:id}));
  }catch{return res.status(503).json({code:'ALERT_READ_UNAVAILABLE'});}
 });
 router.get('/followup',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!followupsEnabled)return res.status(503).json({code:'FOLLOWUP_SERVER_DISABLED'});
   const q=req.query??{};if(Object.keys(q).length!==2||!inventoryUuid(q.productId)||!inventoryUuid(q.variantId))return res.status(400).json({code:'FOLLOWUP_INVALID'});
   const product=q.productId.toLowerCase(),variant=q.variantId.toLowerCase();const {data,error}=await admin().rpc('trusted_inventory_followup',{p_actor:id,p_product:product,p_variant:variant});
   if(error){if(error.code==='P0001'&&error.message==='FOLLOWUP_NOT_FOUND')return res.status(404).json({code:error.message});throw Error();}
   return res.status(200).json(followupRead(data,product,variant));
  }catch{return res.status(503).json({code:'FOLLOWUP_READ_UNAVAILABLE'});}
 });
 router.post('/followup',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!followupsEnabled)return res.status(503).json({code:'FOLLOWUP_SERVER_DISABLED'});
   let body;try{if(Object.keys(req.query??{}).length)throw Error();body=followupRequest(req.body);}catch{return res.status(400).json({code:'FOLLOWUP_INVALID'});}
   const {data,error}=await admin().rpc('trusted_inventory_followup_set',{p_actor:id,p_key:body.idempotencyKey,p_product:body.productId,p_variant:body.variantId,p_inventory_revision:body.inventoryRevision,p_policy_revision:body.policyRevision,p_revision:body.expectedRevision,p_status:body.status,p_reason:body.reason});
   if(error){const codes={FOLLOWUP_STALE_CONTEXT:409,FOLLOWUP_STALE_REVISION:409,FOLLOWUP_CONFLICT:409,FOLLOWUP_INACTIVE:409,FOLLOWUP_DISABLED:503,FOLLOWUP_NOT_FOUND:404,FOLLOWUP_INVALID:400,INVENTORY_FORBIDDEN:403};if(error.code==='P0001'&&Object.hasOwn(codes,error.message))return res.status(codes[error.message]).json({code:error.message});throw Error();}
   return res.status(200).json(followupReceipt(data,id,body));
  }catch{return res.status(503).json({code:'FOLLOWUP_RESULT_UNCONFIRMED'});}
 });
 router.get('/followup/history',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;
   if(!followupsEnabled)return res.status(503).json({code:'FOLLOWUP_SERVER_DISABLED'});
   let q;try{q=followupHistoryRequest(req.query??{});}catch{return res.status(400).json({code:'FOLLOWUP_INVALID'});}
   const {data,error}=await admin().rpc('trusted_inventory_followup_history',{p_actor:id,p_product:q.productId,p_variant:q.variantId,p_before:q.before,p_before_id:q.beforeId,p_limit:20});
   if(error)throw Error();return res.status(200).json(followupHistory(data,q));
  }catch{return res.status(503).json({code:'FOLLOWUP_HISTORY_UNAVAILABLE'});}
 });
 router.get('/assignees',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;if(!assignmentsEnabled)return res.status(503).json({code:'ASSIGNMENT_SERVER_DISABLED'});
   let after;try{after=assigneeQuery(req.query??{});}catch{return res.status(400).json({code:'ASSIGNMENT_INVALID'});}
   const {data,error}=await admin().rpc('trusted_inventory_assignees',{p_actor:id,p_after:after,p_limit:50});if(error)throw Error();return res.status(200).json(assigneePage(data,after));
  }catch{return res.status(503).json({code:'ASSIGNMENT_READ_UNAVAILABLE'});}
 });
 router.get('/assignment',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;if(!assignmentsEnabled)return res.status(503).json({code:'ASSIGNMENT_SERVER_DISABLED'});
   const q=req.query??{};if(Object.keys(q).length!==2||!inventoryUuid(q.productId)||!inventoryUuid(q.variantId))return res.status(400).json({code:'ASSIGNMENT_INVALID'});
   const product=q.productId.toLowerCase(),variant=q.variantId.toLowerCase();const {data,error}=await admin().rpc('trusted_inventory_assignment',{p_actor:id,p_product:product,p_variant:variant});if(error)throw Error();return res.status(200).json(assignmentRead(data,product,variant));
  }catch{return res.status(503).json({code:'ASSIGNMENT_READ_UNAVAILABLE'});}
 });
 router.post('/assignment',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;if(!assignmentsEnabled)return res.status(503).json({code:'ASSIGNMENT_SERVER_DISABLED'});
   let body;try{if(Object.keys(req.query??{}).length)throw Error();body=assignmentRequest(req.body);}catch{return res.status(400).json({code:'ASSIGNMENT_INVALID'});}
   const {data,error}=await admin().rpc('trusted_inventory_assignment_set',{p_actor:id,p_key:body.idempotencyKey,p_product:body.productId,p_variant:body.variantId,p_inventory_revision:body.inventoryRevision,p_policy_revision:body.policyRevision,p_revision:body.expectedRevision,p_assignee:body.assigneeId,p_reason:body.reason});
   if(error){const codes={ASSIGNMENT_STALE_CONTEXT:409,ASSIGNMENT_STALE_REVISION:409,ASSIGNMENT_CONFLICT:409,ASSIGNMENT_INACTIVE:409,ASSIGNMENT_TARGET_INACTIVE:409,ASSIGNMENT_UNCHANGED:409,ASSIGNMENT_DISABLED:503,ASSIGNMENT_NOT_FOUND:404,ASSIGNMENT_INVALID:400,INVENTORY_FORBIDDEN:403};if(error.code==='P0001'&&Object.hasOwn(codes,error.message))return res.status(codes[error.message]).json({code:error.message});throw Error();}return res.status(200).json(assignmentReceipt(data,id,body));
  }catch{return res.status(503).json({code:'ASSIGNMENT_RESULT_UNCONFIRMED'});}
 });
 router.get('/assignment/history',async(req,res)=>{
  try{const id=await actor(req,res);if(!id)return;if(!assignmentsEnabled)return res.status(503).json({code:'ASSIGNMENT_SERVER_DISABLED'});
   let q;try{q=assignmentHistoryRequest(req.query??{});}catch{return res.status(400).json({code:'ASSIGNMENT_INVALID'});}
   const {data,error}=await admin().rpc('trusted_inventory_assignment_history',{p_actor:id,p_product:q.productId,p_variant:q.variantId,p_before:q.before,p_before_id:q.beforeId,p_limit:20});if(error)throw Error();return res.status(200).json(assignmentHistory(data,q));
  }catch{return res.status(503).json({code:'ASSIGNMENT_HISTORY_UNAVAILABLE'});}
 });
 return router;
}
export default createInventoryRouter();
