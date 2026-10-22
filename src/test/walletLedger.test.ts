// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {createWalletRouter} from '../../server/wallet-routes.js';
import {createPaymentRouter} from '../../server/bitpay-routes.js';
import express from 'express';
const key='41000000-0000-4000-8000-000000000001';
const body=()=>({idempotencyKey:key,selection:{addressId:key,shippingOption:'tipax',items:[{productId:key,quantity:1}]},quote:'server-quote'});
function response(){return {statusCode:200,headers:{},data:null,set:vi.fn().mockReturnThis(),status:vi.fn(function(code){this.statusCode=code;return this;}),json:vi.fn(function(data){this.data=data;return this;})};}
async function invoke(router,path,request){const layer=router.stack.find(item=>item.route?.path===path);const res=response();await layer.route.stack[0].handle({headers:{authorization:'Bearer fixture'},body:request,params:{id:key}},res);return res;}
it('spending is off by default before auth or database access',async()=>{const auth=vi.fn(),admin=vi.fn();const r=await invoke(createWalletRouter({auth,admin,enabled:false}),'/checkout',body());expect(r.statusCode).toBe(503);expect(auth).not.toHaveBeenCalled();expect(admin).not.toHaveBeenCalled();});
it('requires authenticated server identity',async()=>{const rpc=vi.fn();const r=await invoke(createWalletRouter({enabled:true,auth:async()=>null,admin:()=>({rpc})}),'/checkout',body());expect(r.statusCode).toBe(401);expect(rpc).not.toHaveBeenCalled();});
it.each(['userId','amount','walletBalance','status','payment_method'])('rejects browser financial/owner override %s',async field=>{const rpc=vi.fn();const r=await invoke(createWalletRouter({enabled:true,auth:async()=>({id:'server-user'}),admin:()=>({rpc})}),'/checkout',{...body(),[field]:1});expect(r.statusCode).toBe(400);expect(rpc).not.toHaveBeenCalled();});
it.each([null,{}, {idempotencyKey:'bad',selection:{}}, {idempotencyKey:key,selection:[],quote:'x'}, {idempotencyKey:key,selection:{},quote:''}])('rejects malformed request %j',async request=>{const rpc=vi.fn();const r=await invoke(createWalletRouter({enabled:true,auth:async()=>({id:'server-user'}),admin:()=>({rpc})}),'/checkout',request);expect(r.statusCode).toBe(400);expect(rpc).not.toHaveBeenCalled();});
it('uses server identity and a single atomic checkout RPC',async()=>{const rpc=vi.fn().mockResolvedValue({data:{success:true,orderId:key}});const r=await invoke(createWalletRouter({enabled:true,auth:async()=>({id:'server-user'}),admin:()=>({rpc})}),'/checkout',body());expect(r.statusCode).toBe(200);expect(rpc).toHaveBeenCalledExactlyOnceWith('trusted_wallet_checkout',{p_user:'server-user',p_key:key,p_request:body().selection,p_quote:'server-quote'});expect(r.set).toHaveBeenCalledWith('Cache-Control','no-store');});
it('quotes do not create an order',async()=>{const rpc=vi.fn().mockResolvedValue({data:{quote:'q',total:20000}});const r=await invoke(createWalletRouter({enabled:true,auth:async()=>({id:'server-user'}),admin:()=>({rpc})}),'/checkout/quote',body());expect(r.statusCode).toBe(200);expect(rpc.mock.calls[0][1].p_quote).toBeNull();});
it.each([{error:{message:'secret internal failure'}},{data:null},{data:{success:false}}])('database failure never reports payment success',async result=>{const rpc=vi.fn().mockResolvedValue(result);const r=await invoke(createWalletRouter({enabled:true,auth:async()=>({id:'server-user'}),admin:()=>({rpc})}),'/checkout',body());expect(r.statusCode).toBe(409);expect(JSON.stringify(r.data)).not.toContain('secret');});
it.each([['CHECKOUT_EXPIRED',409],['PENDING_ORDER_LIMIT',429]])('preserves checkout rejection %s',async(code,status)=>{const rpc=vi.fn().mockResolvedValue({data:{code}});const r=await invoke(createWalletRouter({enabled:true,auth:async()=>({id:'server-user'}),admin:()=>({rpc})}),'/checkout',body());expect(r.statusCode).toBe(status);});
it.each([true,false])('wallet receipt requires durable debit proof: %s',async proof=>{const order={id:key,user_id:'server-user',payment_method:'wallet',payment_state:'paid'};const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:order})};const rpc=vi.fn().mockResolvedValue({data:proof});const r=await invoke(createPaymentRouter({auth:async()=>({id:'server-user'}),admin:()=>({from:()=>query,rpc})}),'/orders/:id/status',{});expect(r.data.paid).toBe(proof);expect(rpc).toHaveBeenCalledWith('trusted_wallet_receipt',{p_order:key,p_user:'server-user'});});
it('real loopback HTTP rejects unauthenticated, forged-money and oversized requests',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{success:true,orderId:key}}),app=express();
 app.use(express.json({limit:'32kb'}));app.use('/api/wallet',createWalletRouter({enabled:true,auth:async h=>h==='Bearer fixture'?{id:'server-user'}:null,admin:()=>({rpc})}));
 app.use((error,_req,res,_next)=>res.status(error.type==='entity.too.large'?413:400).json({error:'Invalid request'}));
 const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{const address=server.address();if(!address||typeof address==='string')throw Error('No port');const url=`http://127.0.0.1:${address.port}/api/wallet/checkout`;
  const post=(request,token='Bearer fixture')=>fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:token},body:JSON.stringify(request),signal:AbortSignal.timeout(3000)});
  expect((await post(body(),'Bearer invalid')).status).toBe(401);
  expect((await post({...body(),amount:1})).status).toBe(400);
  expect((await post({...body(),padding:'x'.repeat(33000)})).status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();expect((await post(body())).status).toBe(200);expect(rpc).toHaveBeenCalledTimes(1);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
});
