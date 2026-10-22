// Synthetic identities and mocked provider only; no network or saved credentials.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createPaymentRouter} from '../../server/bitpay-routes.js';
import {createBitpayProvider} from '../../server/bitpay-provider.js';
const user='51000000-0000-4000-8000-000000000001',key='51000000-0000-4000-8000-000000000002';
const id='51000000-0000-4000-8000-000000000003',topup='51000000-0000-4000-8000-000000000004';
const attempt={id,topup_id:topup,order_id:null,version:2,provider:'bitpay',merchant:'fixture',currency:'IRR',amount:20000,state:'creating',claimed:true,provider_ref:null};
const ready={...attempt,state:'ready',claimed:false,provider_ref:'951001'};
const evidence={amount:20000,currency:'IRR',merchant:'fixture',reference:'951001',transaction:'951002'};
const rpc=vi.fn(),auth=vi.fn(),create=vi.fn(),verify=vi.fn();
const provider={newPaymentsEnabled:true,create,verify,redirect:(ref:string)=>'https://provider.invalid/'+ref};
const router=(opts={})=>createPaymentRouter({admin:()=>({rpc}),auth,provider,merchant:()=> 'fixture',topupsEnabled:true,recoveryEnabled:false,...opts});
async function invoke(path:string,body:object={},opts={},params={id:topup}){
 const target=router(opts),handler=target.stack.find(layer=>layer.route?.path===path).route.stack[0].handle;
 const res={status:vi.fn(),json:vi.fn(),set:vi.fn()};Object.values(res).forEach(fn=>fn.mockReturnValue(res));
 await handler({body,params,headers:{authorization:'Bearer fixture'}},res);return res;
}
const start=()=>invoke('/wallet-init',{idempotencyKey:key,amount:20000});
const callback=()=>invoke('/wallet-verify',{topup_id:topup,id_get:'951001',trans_id:'951002'});
beforeEach(()=>{
 vi.resetAllMocks();auth.mockResolvedValue({id:user});create.mockResolvedValue({...evidence,reference:'951001'});verify.mockResolvedValue(evidence);
 rpc.mockImplementation(async(name:string)=>({data:({trusted_wallet_topup_claim:attempt,trusted_wallet_topup_attach:ready,
  trusted_wallet_topup_status:{topupId:topup,paid:false},trusted_payment_lookup:ready,
  trusted_verification_claim:{claimed:true,state:'verifying'},trusted_verification_record:{recorded:true},trusted_payment_settle:{success:true}})[name],error:null}));
});
describe('new wallet topup boundary',()=>{
 it('fails closed before touching auth, provider or database when the server switch is off',async()=>{
  expect((await invoke('/wallet-init',{}, {topupsEnabled:false})).status).toHaveBeenCalledWith(503);expect(auth).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
 });
 it('requires the independently enabled provider',async()=>{expect((await invoke('/wallet-init',{}, {provider:{...provider,newPaymentsEnabled:false}})).status).toHaveBeenCalledWith(503);expect(rpc).not.toHaveBeenCalled();});
 it('requires a validated login',async()=>{auth.mockResolvedValue(null);expect((await start()).status).toHaveBeenCalledWith(401);expect(rpc).not.toHaveBeenCalled();});
 it.each([4999,100000000,0,-1,20000.5,'20000',null])('rejects invalid rial amount %j',async amount=>{
  expect((await invoke('/wallet-init',{idempotencyKey:key,amount})).status).toHaveBeenCalledWith(400);expect(rpc).not.toHaveBeenCalled();
 });
 it.each([{userId:'victim'},{merchant:'other'},{redirect:'https://evil.invalid'},{currency:'IRT'},{topup_id:topup}])('rejects injected fields %j',async patch=>{
  expect((await invoke('/wallet-init',{idempotencyKey:key,amount:20000,...patch})).status).toHaveBeenCalledWith(400);expect(rpc).not.toHaveBeenCalled();
 });
 it('persists the authenticated claim before exactly one provider create, then attaches',async()=>{
  create.mockImplementation(async a=>{expect(rpc.mock.calls.map(c=>c[0])).toEqual(['trusted_wallet_topup_claim']);expect(a).toEqual(attempt);return evidence;});
  const res=await start();expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
  expect(rpc.mock.calls[0]).toEqual(['trusted_wallet_topup_claim',{p_user:user,p_key:key,p_amount:20000,p_merchant:'fixture'}]);
  expect(res.json).toHaveBeenCalledWith({topupId:topup,redirectUrl:'https://provider.invalid/951001'});expect(create).toHaveBeenCalledTimes(1);
 });
 it('reuses the same ready reference without another create',async()=>{rpc.mockResolvedValue({data:ready});expect((await start()).json).toHaveBeenCalledWith({topupId:topup,redirectUrl:'https://provider.invalid/951001'});expect(create).not.toHaveBeenCalled();});
 it('does not retry unresolved creation after a timeout/crash',async()=>{rpc.mockResolvedValue({data:{...attempt,claimed:false}});expect((await start()).status).toHaveBeenCalledWith(409);expect(create).not.toHaveBeenCalled();});
 it('does not create after database rejection (including gate, quota or idempotency conflict)',async()=>{rpc.mockResolvedValue({error:{message:'Synthetic rejection'}});expect((await start()).status).toHaveBeenCalledWith(409);expect(create).not.toHaveBeenCalled();});
 it('returns a pending id after provider ambiguity without re-creating',async()=>{create.mockRejectedValue(Error('Synthetic timeout'));expect((await start()).json).toHaveBeenCalledWith(expect.objectContaining({code:'TOPUP_PENDING_REVIEW',topupId:topup}));expect(create).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledTimes(1);});
 it.each([{merchant:'wrong'},{amount:20001},{currency:'IRT'}])('refuses mismatched provider creation %j',async patch=>{create.mockResolvedValue({...evidence,...patch});expect((await start()).status).toHaveBeenCalledWith(409);expect(rpc).toHaveBeenCalledTimes(1);});
 it('refuses a mismatched attachment and never reports a redirect',async()=>{rpc.mockImplementation(async name=>({data:name==='trusted_wallet_topup_claim'?attempt:{...ready,provider_ref:'951999'}}));expect((await start()).status).toHaveBeenCalledWith(409);});
 it('requires a real credit receipt before returning paid on an initiation retry',async()=>{rpc.mockImplementation(async name=>({data:name==='trusted_wallet_topup_claim'?{...ready,state:'settled'}:{topupId:topup,paid:false}}));expect((await start()).status).toHaveBeenCalledWith(409);expect(create).not.toHaveBeenCalled();});
 it('serves status only through an owner-bound RPC',async()=>{await invoke('/wallet-topups/:id/status');expect(rpc).toHaveBeenCalledExactlyOnceWith('trusted_wallet_topup_status',{p_user:user,p_topup:topup});});
 it('hides foreign or absent topups without leaking database errors',async()=>{rpc.mockResolvedValue({error:{message:'Synthetic private error'}});expect((await invoke('/wallet-topups/:id/status')).status).toHaveBeenCalledWith(404);});
});
describe('durable new topup verification even with order recovery disabled',()=>{
 it('allows existing returns while the new-topup server gate is closed',async()=>{expect((await invoke('/wallet-verify',{topup_id:topup,id_get:'951001',trans_id:'951002'},{topupsEnabled:false})).json).toHaveBeenCalledWith({success:true});});
 it('binds the owner, persists evidence and only then settles',async()=>{
  expect((await callback()).json).toHaveBeenCalledWith({success:true});
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['trusted_payment_lookup','trusted_wallet_topup_status','trusted_verification_claim','trusted_verification_record','trusted_payment_settle']);
  expect(rpc.mock.calls[2][1]).toEqual({p_attempt:id,p_transaction:'951002',p_user:user});expect(verify).toHaveBeenCalledTimes(1);
 });
 it('blocks logged-out callbacks before claiming verification',async()=>{auth.mockResolvedValue(null);expect((await callback()).status).toHaveBeenCalledWith(401);expect(verify).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);});
 it('blocks a different owner before poisoning the verification claim',async()=>{rpc.mockImplementation(async name=>name==='trusted_payment_lookup'?{data:ready}:{error:{message:'owner'}});await callback();expect(verify).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(2);});
 it('blocks logged-out settled replay too',async()=>{rpc.mockResolvedValue({data:{...ready,state:'settled',transaction_id:'951002'}});auth.mockResolvedValue(null);expect((await callback()).status).toHaveBeenCalledWith(401);});
 it('waits on an unresolved verification instead of re-contacting the provider',async()=>{rpc.mockImplementation(async name=>({data:name==='trusted_payment_lookup'?ready:name==='trusted_wallet_topup_status'?{topupId:topup,paid:false}:{state:'verifying',claimed:false}}));await callback();expect(verify).not.toHaveBeenCalled();expect(rpc.mock.calls.some(c=>c[0]==='trusted_payment_settle')).toBe(false);});
 it('replays already durable evidence without any provider request',async()=>{rpc.mockImplementation(async name=>({data:name==='trusted_payment_lookup'?ready:name==='trusted_wallet_topup_status'?{topupId:topup,paid:false}:name==='trusted_verification_claim'?{state:'verified',claimed:false,evidence}:{success:true}}));expect((await callback()).json).toHaveBeenCalledWith({success:true});expect(verify).not.toHaveBeenCalled();});
 it('never records or credits an already-verified/ambiguous provider response',async()=>{verify.mockRejectedValue(Error('PAYMENT_ALREADY_VERIFIED'));await callback();expect(rpc.mock.calls.some(c=>['trusted_verification_record','trusted_payment_settle'].includes(c[0]))).toBe(false);});
 it('never settles after the evidence write fails',async()=>{const defaultRpc=rpc.getMockImplementation();rpc.mockImplementation(async(name,...args)=>name==='trusted_verification_record'?{error:{message:'write failed'}}:defaultRpc(name,...args));await callback();expect(rpc.mock.calls.some(c=>c[0]==='trusted_payment_settle')).toBe(false);});
 it('never returns success after settlement fails, while leaving durable evidence for recovery',async()=>{const defaultRpc=rpc.getMockImplementation();rpc.mockImplementation(async(name,...args)=>name==='trusted_payment_settle'?{error:{message:'write failed'}}:defaultRpc(name,...args));expect((await callback()).json).toHaveBeenCalledWith({success:false,reason:'verification_pending'});expect(rpc.mock.calls.some(c=>c[0]==='trusted_verification_record')).toBe(true);});
 it('keeps cancellation advisory without a provider request or verification claim',async()=>{await invoke('/wallet-verify',{topup_id:topup,id_get:'951001',trans_id:'0'});expect(verify).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(2);});
});
describe('documented provider topup redirect contract',()=>{
 const wire=vi.fn();
 const adapter=()=>createBitpayProvider({environment:'production',credentialEnvironment:'production',apiKey:'k'.repeat(52),merchant:'fixture',callbackOrigin:'https://shop.invalid',fetchImpl:wire,newPaymentsEnabled:true});
 it('uses only the persisted topup id and fixed callback origin',async()=>{wire.mockResolvedValue({ok:true,text:async()=> '951001'});await adapter().create(attempt);const fields=new URLSearchParams(wire.mock.calls[0][1].body);expect(fields.get('redirect')).toBe('https://shop.invalid/account/wallet/verify?topup_id='+topup);expect(fields.get('amount')).toBe('20000');});
 it.each([{order_id:id},{topup_id:null},{topup_id:''}])('rejects ambiguous or missing payment parent %j before transport',async patch=>{wire.mockClear();await expect(adapter().create({...attempt,...patch})).rejects.toThrow();expect(wire).not.toHaveBeenCalled();});
});

describe('definite SQL refusal versus an unknown committed topup claim',()=>{
 it.each(['Pending topup limit','Wallet balance capacity','New topups disabled','Invalid wallet balance','Wallet review required'])('permits reset only for definite business refusal: %s',async message=>{
  rpc.mockResolvedValue({error:{code:'P0001',message}});expect((await start()).json).toHaveBeenCalledWith(expect.objectContaining({code:'TOPUP_REJECTED'}));expect(create).not.toHaveBeenCalled();
 });
 it.each([{code:'FETCH_ERROR',message:'Pending topup limit'},{code:'P0001',message:'Topup idempotency conflict'},{code:'08006',message:'connection lost'}])('retains the operation for an ambiguous/conflicting claim %j',async error=>{
  rpc.mockResolvedValue({error});expect((await start()).json).toHaveBeenCalledWith(expect.objectContaining({code:'TOPUP_PENDING_REVIEW'}));expect(create).not.toHaveBeenCalled();
 });
});

it('sanitizes even a non-Error provider rejection',async()=>{create.mockRejectedValue(null);expect((await start()).status).toHaveBeenCalledWith(409);});
