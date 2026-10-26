// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {createInventoryRouter} from '../../server/inventory-routes.js';
const id=(n:number)=>'a5000000-0000-4000-8000-'+String(n).padStart(12,'0');
const body=()=>({productId:id(1),variantId:id(2),expectedRevision:0,threshold:5,reason:'reorder policy',idempotencyKey:id(3)});
const receipt=()=>({productId:id(1),variantId:id(2),revision:1,threshold:5,beforeThreshold:null,reason:'reorder policy',actorId:id(8),requestId:id(3),createdAt:'2026-10-24T19:00:00.123456Z'});
const policy=()=>({version:1,productId:id(1),variantId:id(2),revision:0,threshold:null,updatedBy:null,lastRequestId:null,updatedAt:null,available:5,alert:'unset',saleEnabled:true,writesEnabled:false});
async function invoke(method='post',input:unknown=body(),opts:Record<string,unknown>={},result:unknown=method==='get'?policy():receipt()){
 const rpc=vi.fn().mockResolvedValue({data:result}),admin=vi.fn().mockReturnValue({rpc}),res={status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};
 const router=createInventoryRouter({enabled:false,reportsEnabled:false,policiesEnabled:true,auth:async()=>({user:{id:id(8)},admin:true}),admin,...opts});
 const route=router.stack.find(layer=>layer.route.path==='/policy'&&layer.route.methods[method]);await route.route.stack[0].handle({headers:{authorization:'Bearer synthetic'},query:method==='get'?input:{},body:input},res);return{rpc,admin,res};
}
it('binds actor and returns only the matching setting receipt independently of stock/report gates',async()=>{const r=await invoke();expect(r.rpc).toHaveBeenCalledWith('trusted_inventory_policy_set',{p_actor:id(8),p_key:id(3),p_product:id(1),p_variant:id(2),p_revision:0,p_threshold:5,p_reason:'reorder policy'});expect(r.res.json).toHaveBeenCalledWith(receipt());expect(r.res.set).toHaveBeenCalledWith('Cache-Control','no-store');});
it('leaves policy access closed before any service access',async()=>{const r=await invoke('post',body(),{policiesEnabled:false});expect(r.res.status).toHaveBeenCalledWith(503);expect(r.admin).not.toHaveBeenCalled();});
it.each([null,{user:{id:id(8)},admin:false},{user:{id:id(8)},admin:'true'}])('requires verified identity and explicit role %#',async identity=>{const r=await invoke('post',body(),{auth:async()=>identity});expect(r.admin).not.toHaveBeenCalled();});
it.each([{actorId:id(9)},{threshold:'5'},{threshold:-1},{threshold:100001},{expectedRevision:1.5},{expectedRevision:2147483647},{reason:'x'},{stock_quantity:99}])('rejects request override/invalid value %#',async patch=>{const r=await invoke('post',{...body(),...patch});expect(r.res.status).toHaveBeenCalledWith(400);expect(r.rpc).not.toHaveBeenCalled();});
it('accepts explicit null for disabling rather than converting zero to null',async()=>{const r=await invoke('post',{...body(),threshold:null},{},{...receipt(),threshold:null});expect(r.rpc.mock.calls[0][1].p_threshold).toBeNull();expect(r.res.status).toHaveBeenCalledWith(200);});
it('returns read-only policy and derives alert consistency',async()=>{const r=await invoke('get',{productId:id(1),variantId:id(2)});expect(r.res.json).toHaveBeenCalledWith(policy());const bad=await invoke('get',{productId:id(1),variantId:id(2)},{},{...policy(),alert:'low'});expect(bad.res.status).toHaveBeenCalledWith(503);});
it.each([{actorId:id(9)},{requestId:id(9)},{threshold:6},{revision:2}])('never confirms an unrelated receipt %#',async patch=>{const r=await invoke('post',body(),{},{...receipt(),...patch});expect(r.res.status).toHaveBeenCalledWith(503);});
it('maps a known stale rejection without exposing raw diagnostics',async()=>{const rpc=vi.fn().mockResolvedValue({error:{code:'P0001',message:'POLICY_STALE'}});const r=await invoke('post',body(),{admin:()=>({rpc})});expect(r.res.status).toHaveBeenCalledWith(409);expect(r.res.json).toHaveBeenCalledWith({code:'POLICY_STALE'});});
