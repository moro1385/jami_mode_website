// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {createInventoryRouter} from '../../server/inventory-routes.js';
const id=(n:number)=>'a4000000-0000-4000-8000-'+String(n).padStart(12,'0');
const balance=()=>({version:1,productId:id(1),variantId:id(2),available:8,reserved:'2',overdue:'1',paid:'3',released:'4',legacy:'0',reviewLines:'0',saleEnabled:true,asOf:'2026-10-24T19:00:00.123456Z'});
async function invoke(options:Record<string,unknown>={},query:Record<string,unknown>={productId:id(1),variantId:id(2)},result:unknown=balance()){
 const rpc=vi.fn().mockResolvedValue({data:result}),admin=vi.fn().mockReturnValue({rpc}),res={status:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};
 const router=createInventoryRouter({enabled:false,reportsEnabled:true,auth:async()=>({user:{id:id(8)},admin:true}),admin,...options});
 await router.stack.find(layer=>layer.route.path==='/balance').route.stack[0].handle({headers:{authorization:'Bearer synthetic'},query},res);return{rpc,admin,res};
}
describe('read-only inventory report route',()=>{
 it('allows reporting independently of disabled stock adjustment and binds the verified actor',async()=>{const r=await invoke();expect(r.res.json).toHaveBeenCalledWith(balance());expect(r.rpc).toHaveBeenCalledWith('trusted_inventory_balance',{p_actor:id(8),p_product:id(1),p_variant:id(2)});expect(r.res.set).toHaveBeenCalledWith('Cache-Control','no-store');});
 it('keeps report activation closed before database access',async()=>{const r=await invoke({reportsEnabled:false});expect(r.res.status).toHaveBeenCalledWith(503);expect(r.admin).not.toHaveBeenCalled();});
 it('requires verified identity and an explicit admin result',async()=>{for(const auth of [async()=>null,async()=>({user:{id:id(8)},admin:'true'})]){const r=await invoke({auth});expect(r.admin).not.toHaveBeenCalled();expect(r.res.status).toHaveBeenCalledWith(expect.any(Number));}});
 it.each([{actorId:id(9),productId:id(1),variantId:id(2)},{productId:[id(1)],variantId:id(2)},{productId:id(1)}, {productId:id(1),variantId:'bad'}])('rejects malformed selection or caller overrides before RPC %#',async query=>{const r=await invoke({},query);expect(r.res.status).toHaveBeenCalledWith(400);expect(r.rpc).not.toHaveBeenCalled();});
 it.each([{available:-1},{available:'8'},{reserved:2},{overdue:'3'},{paid:'1e2'},{version:2},{productId:id(9)},{asOf:'invalid'}])('rejects a malformed or cross-product result %#',async patch=>{const r=await invoke({},undefined,{...balance(),...patch});expect(r.res.status).toHaveBeenCalledWith(503);expect(r.res.json).toHaveBeenCalledWith({code:'INVENTORY_REPORT_UNAVAILABLE'});});
 it('allows null stock and exact large counts but strips private/unrequested data',async()=>{const payload={...balance(),available:null,paid:'9007199254740993',customerPhone:'synthetic-private'};const r=await invoke({},undefined,payload);expect(r.res.json.mock.calls[0][0]).toMatchObject({available:null,paid:'9007199254740993'});expect(r.res.json.mock.calls[0][0]).not.toHaveProperty('customerPhone');});
});
