// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {createWalletRouter} from '../../server/wallet-routes.js';
const user='61000000-0000-4000-8000-000000000001';
const view={balance:10000,currency:'IRR',entries:[],pendingTopups:[],hasMore:false,spendingEnabled:true,topupsEnabled:true};
async function invoke({auth=async()=>({id:user}),rpc=vi.fn().mockResolvedValue({data:view}),enabled=false,topupsEnabled=false,query={}}={}){
 const router=createWalletRouter({auth,admin:()=>({rpc}),enabled,topupsEnabled});const res={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis()};
 await router.stack.find(l=>l.route.path==='/summary').route.stack[0].handle({headers:{authorization:'Bearer fixture'},query},res);return {res,rpc};
}
it('requires validated login before any ledger lookup',async()=>{const {res,rpc}=await invoke({auth:async()=>null});expect(res.status).toHaveBeenCalledWith(401);expect(rpc).not.toHaveBeenCalled();});
it('binds view to server identity, never a user query parameter',async()=>{const {rpc,res}=await invoke();expect(rpc).toHaveBeenCalledExactlyOnceWith('trusted_wallet_view',{p_user:user,p_before:null,p_before_id:null,p_limit:20});expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.json).toHaveBeenCalledWith({...view,topupsEnabled:false,spendingEnabled:false});});
it.each([{userId:'victim'},{before:'bad',beforeId:user},{before:'2026-10-23T00:00:00Z'},{beforeId:user},{before:['2026-10-23T00:00:00Z'],beforeId:user}])('rejects injected or invalid cursor %j',async query=>{const {res,rpc}=await invoke({query});expect(res.status).toHaveBeenCalledWith(400);expect(rpc).not.toHaveBeenCalled();});
it('passes a bounded precise timestamp/id cursor to the database',async()=>{const {rpc}=await invoke({query:{before:'2026-10-23T00:00:00.123456Z',beforeId:user}});expect(rpc.mock.calls[0][1]).toEqual({p_user:user,p_before:'2026-10-23T00:00:00.123456Z',p_before_id:user,p_limit:20});});
it('requires both server and database activation gates',async()=>{const {res}=await invoke({enabled:true,topupsEnabled:true});expect(res.json).toHaveBeenCalledWith(view);const other=await invoke({enabled:true,topupsEnabled:true,rpc:vi.fn().mockResolvedValue({data:{...view,spendingEnabled:false,topupsEnabled:false}})});expect(other.res.json).toHaveBeenCalledWith({...view,spendingEnabled:false,topupsEnabled:false});});
it('never substitutes a cached or zero balance after a failed lookup',async()=>{const {res}=await invoke({rpc:vi.fn().mockResolvedValue({error:{message:'private fixture'}})});expect(res.status).toHaveBeenCalledWith(503);expect(JSON.stringify(res.json.mock.calls)).not.toContain('private fixture');});

it('shows the opening-review explanation only when server topups are enabled',async()=>{
 const rpc=()=>vi.fn().mockResolvedValue({data:{...view,topupsEnabled:false,topupReviewRequired:true}});
 const on=await invoke({topupsEnabled:true,rpc:rpc()});expect(on.res.json).toHaveBeenCalledWith({...view,spendingEnabled:false,topupsEnabled:false,reviewRequired:true});
 const off=await invoke({topupsEnabled:false,rpc:rpc()});expect(off.res.json).toHaveBeenCalledWith({...view,spendingEnabled:false,topupsEnabled:false});
});
