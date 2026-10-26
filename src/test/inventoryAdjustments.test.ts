// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import {createClient} from '@supabase/supabase-js';
import {createInventoryRouter} from '../../server/inventory-routes.js';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
const id=(n:number)=>'a1000000-0000-4000-8000-'+String(n).padStart(12,'0');
const body=()=>({productId:id(1),variantId:id(2),expected:{quantity:10,sku:'SKU-1',size:'M',color:'red'},delta:-2,reason:'count correction',idempotencyKey:id(3)});
const entry=()=>({id:id(4),requestId:id(3),actorId:id(8),productId:id(1),variantId:id(2),before:10,after:8,delta:-2,reason:'count correction',createdAt:'2026-10-24T01:00:00.123456Z',sku:'SKU-1',size:'M',color:'red'});
const identity=()=>({user:{id:id(8)},admin:true});
const response=()=>({status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
async function invoke(path='/adjustments',request:unknown=body(),options:Record<string,unknown>={},query:Record<string,unknown>={}){
 const rpc=vi.fn().mockResolvedValue({data:path==='/status'?{version:1,adjustmentsEnabled:true}:path==='/history'?{entries:[entry()],hasMore:false}:entry()}),admin=vi.fn().mockReturnValue({rpc});
 const router=createInventoryRouter({auth:async()=>identity(),admin,enabled:true,...options}),res=response();
 await router.stack.find(layer=>layer.route.path===path).route.stack[0].handle({headers:{authorization:'Bearer synthetic'},body:request,query},res);return{rpc,res,admin};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('inventory authorization and server gate',()=>{
 it('requires verified server identity before service access',async()=>{const r=await invoke('/adjustments',body(),{auth:async()=>null});expect(r.res.status).toHaveBeenCalledWith(401);expect(r.admin).not.toHaveBeenCalled();});
 it.each([false,'true',undefined])('requires an explicit admin result, not truthiness (%s)',async admin=>{const r=await invoke('/adjustments',body(),{auth:async()=>({...identity(),admin})});expect(r.res.status).toHaveBeenCalledWith(403);expect(r.rpc).not.toHaveBeenCalled();});
 it('is closed by default without querying the future database contract',async()=>{
  const r=await invoke('/adjustments',body(),{enabled:false});expect(r.res.status).toHaveBeenCalledWith(503);expect(r.rpc).not.toHaveBeenCalled();
  const status=await invoke('/status',null,{enabled:false});expect(status.res.json).toHaveBeenCalledWith({version:null,adjustmentsEnabled:false,historyAvailable:false});expect(status.rpc).not.toHaveBeenCalled();
 });
 it('requires both server activation and a recognized database version/gate',async()=>{
  const r=await invoke('/status');expect(r.res.json).toHaveBeenCalledWith({version:1,adjustmentsEnabled:true,historyAvailable:true});
  const rpc=vi.fn().mockResolvedValue({data:{version:1,adjustmentsEnabled:false}}),disabled=await invoke('/status',null,{admin:()=>({rpc})});expect(disabled.res.json).toHaveBeenCalledWith({version:1,adjustmentsEnabled:false,historyAvailable:true});
  const bad=await invoke('/status',null,{admin:()=>({rpc:async()=>({data:{version:2,adjustmentsEnabled:true}})})});expect(bad.res.status).toHaveBeenCalledWith(503);
 });
 it('uses getUser and a database role lookup, ignoring user-editable metadata',async()=>{
  vi.stubEnv('SUPABASE_URL','https://synthetic.invalid');vi.stubEnv('SUPABASE_ANON_KEY','synthetic-public');
  const getUser=vi.fn().mockResolvedValue({data:{user:{id:id(8),user_metadata:{role:'admin'}}}}),role=vi.fn().mockResolvedValue({data:false});vi.mocked(createClient).mockReturnValue({auth:{getUser},rpc:role} as never);
  const router=createInventoryRouter({enabled:true,admin:vi.fn()}),res=response();await router.stack.find(layer=>layer.route.path==='/status').route.stack[0].handle({headers:{authorization:'Bearer synthetic'},query:{}},res);
  expect(getUser).toHaveBeenCalledTimes(1);expect(role).toHaveBeenCalledWith('has_role',{_user_id:id(8),_role:'admin'});expect(res.status).toHaveBeenCalledWith(403);
 });
});
describe('inventory request and confirmation boundaries',()=>{
 it.each(['actorId','userId','after','stock_quantity','status','amount'])('refuses caller override %s',async key=>{const r=await invoke('/adjustments',{...body(),[key]:id(9)});expect(r.res.status).toHaveBeenCalledWith(400);expect(r.rpc).not.toHaveBeenCalled();});
 it.each([null,{},[],{...body(),expected:{...body().expected,extra:true}},{...body(),expected:{...body().expected,quantity:'10'}},{...body(),expected:{...body().expected,sku:{bad:true}}}])('refuses malformed payload (%#)',async value=>{const r=await invoke('/adjustments',value);expect(r.res.status).toHaveBeenCalledWith(400);expect(r.rpc).not.toHaveBeenCalled();});
 it.each([0,1.5,1000001,-1000001,-11,Infinity])('refuses invalid, underflowing or oversized delta %s',async delta=>{const r=await invoke('/adjustments',{...body(),delta});expect(r.res.status).toHaveBeenCalledWith(400);expect(r.rpc).not.toHaveBeenCalled();});
 it.each(['','xx','x'.repeat(501),'valid\nreason'])('requires a bounded single-line reason (%#)',async reason=>{const r=await invoke('/adjustments',{...body(),reason});expect(r.res.status).toHaveBeenCalledWith(400);expect(r.rpc).not.toHaveBeenCalled();});
 it('binds one atomic RPC to verified actor, exact snapshot, canonical reason and request key',async()=>{
  const r=await invoke('/adjustments',{...body(),reason:'  count correction  '});expect(r.rpc).toHaveBeenCalledExactlyOnceWith('trusted_inventory_adjust',{p_actor:id(8),p_key:id(3),p_product:id(1),p_variant:id(2),p_expected:body().expected,p_delta:-2,p_reason:'count correction'});expect(r.res.json).toHaveBeenCalledWith({entry:entry()});expect(r.res.set).toHaveBeenCalledWith('Cache-Control','no-store');
 });
 it.each(['actorId','requestId','productId','variantId','delta','after','reason','sku'])('rejects a mismatched result %s instead of announcing success',async key=>{const wrong={...entry(),[key]:['delta','after'].includes(key)?123:key==='reason'?'other reason':id(9)};const r=await invoke('/adjustments',body(),{admin:()=>({rpc:async()=>({data:wrong})})});expect(r.res.status).toHaveBeenCalledWith(503);expect(r.res.json).toHaveBeenCalledWith({code:'INVENTORY_RESULT_UNCONFIRMED'});});
 it('strips unrecognized result fields, including accidental internal diagnostics',async()=>{const r=await invoke('/adjustments',body(),{admin:()=>({rpc:async()=>({data:{...entry(),internalSecret:'never-export'}})})});expect(r.res.json).toHaveBeenCalledWith({entry:entry()});});
 it.each([['INVENTORY_STALE',409],['INVENTORY_REQUEST_CONFLICT',409],['INVENTORY_FORBIDDEN',403],['INVENTORY_DISABLED',503],['INVENTORY_NOT_FOUND',404]])('preserves known rejection %s without leaking database diagnostics',async(code,status)=>{const r=await invoke('/adjustments',body(),{admin:()=>({rpc:async()=>({error:{code:'P0001',message:code,details:'private'}})})});expect(r.res.status).toHaveBeenCalledWith(status);expect(r.res.json).toHaveBeenCalledWith({code});});
 it('never retries an unknown network outcome or returns its internal error',async()=>{const rpc=vi.fn().mockRejectedValue(Error('private lost response'));const r=await invoke('/adjustments',body(),{admin:()=>({rpc})});expect(rpc).toHaveBeenCalledTimes(1);expect(r.res.json).toHaveBeenCalledWith({code:'INVENTORY_RESULT_UNCONFIRMED'});});
});
describe('bounded admin history',()=>{
 it('preserves precise cursor text and binds product/variant plus verified actor',async()=>{const query={productId:id(1),variantId:id(2),before:'2026-10-24T01:00:00.123456Z',beforeId:id(4)},r=await invoke('/history',null,{},query);expect(r.rpc).toHaveBeenCalledExactlyOnceWith('trusted_inventory_history',{p_actor:id(8),p_product:id(1),p_variant:id(2),p_before:query.before,p_before_id:id(4),p_limit:20});});
 it.each([{productId:id(1),variantId:id(2),actorId:id(9)},{productId:id(1),variantId:id(2),limit:1000},{productId:id(1),variantId:id(2),beforeId:id(4)},{productId:[id(1)],variantId:id(2)}])('refuses caller-selected actor/limit or invalid cursor (%#)',async query=>{const r=await invoke('/history',null,{},query);expect(r.res.status).toHaveBeenCalledWith(400);expect(r.rpc).not.toHaveBeenCalled();});
 it('derives the next cursor from the last confirmed receipt without timestamp rounding',async()=>{const r=await invoke('/history',null,{admin:()=>({rpc:async()=>({data:{entries:[entry()],hasMore:true}})})},{productId:id(1),variantId:id(2)});expect(r.res.json).toHaveBeenCalledWith({entries:[entry()],hasMore:true,nextCursor:{before:entry().createdAt,beforeId:id(4)}});});
 it.each([{entries:[],hasMore:true},{entries:[entry(),entry()],hasMore:false},{entries:[{...entry(),productId:id(9)}],hasMore:false}])('rejects malformed/unbound history (%#)',async data=>{const r=await invoke('/history',null,{admin:()=>({rpc:async()=>({data})})},{productId:id(1),variantId:id(2)});expect(r.res.status).toHaveBeenCalledWith(503);});
});
it('real loopback HTTP rejects unauthenticated, nonadmin, forged and oversized writes before RPC',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:entry()}),app=express();app.use(express.json({limit:'32kb'}));app.use('/api/admin/inventory',createInventoryRouter({enabled:true,auth:async token=>token==='Bearer admin'?identity():token==='Bearer user'?{...identity(),admin:false}:null,admin:()=>({rpc})}));app.use((error,_req,res,_next)=>res.status(error.type==='entity.too.large'?413:400).json({code:'INVALID_REQUEST'}));
 const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 try{const address=server.address();if(!address||typeof address==='string')throw Error('No port');const url=`http://127.0.0.1:${address.port}/api/admin/inventory/adjustments`;const post=(value:unknown,token='Bearer admin')=>fetch(url,{method:'POST',headers:{authorization:token,'content-type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(3000)});
  expect((await post(body(),'Bearer invalid')).status).toBe(401);expect((await post(body(),'Bearer user')).status).toBe(403);expect((await post({...body(),actorId:id(9)})).status).toBe(400);expect((await post({...body(),padding:'x'.repeat(33000)})).status).toBe(413);expect(rpc).not.toHaveBeenCalled();expect((await post(body())).status).toBe(200);expect(rpc).toHaveBeenCalledTimes(1);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
});
