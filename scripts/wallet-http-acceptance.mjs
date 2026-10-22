// Real loopback Express + disposable PostgreSQL. Fake Auth/provider only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createWalletRouter} from '../server/wallet-routes.js';
import {createPaymentRouter} from '../server/bitpay-routes.js';
import {createBitpayProvider} from '../server/bitpay-provider.js';
export async function runWalletHttpAcceptance({psql}){
 const user=randomUUID(),other=randomUUID(),historical=randomUUID(),product=randomUUID(),address=randomUUID(),key=randomUUID();
 const lit=v=>v==null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 const json=sql=>JSON.parse(query(sql));
 query(`INSERT INTO auth.users(id) VALUES('${user}'),('${other}');INSERT INTO auth.users(id,created_at) VALUES('${historical}','2020-01-01');INSERT INTO public.products(id,name,slug,price,is_active,is_out_of_stock,sizes,colors) VALUES('${product}','HTTP wallet fixture','http-${product}',20000,true,false,'{}','{}');INSERT INTO public.addresses(id,user_id,line1) VALUES('${address}','${user}','Synthetic');UPDATE checkout_private.wallet_control SET topups_enabled=true,spending_enabled=true;`);
 const signatures={
  trusted_wallet_view:['p_user','p_before','p_before_id','p_limit'],trusted_wallet_topup_claim:['p_user','p_key','p_amount','p_merchant'],
  trusted_wallet_topup_attach:['p_attempt','p_user','p_ref','p_merchant'],trusted_wallet_topup_status:['p_user','p_topup'],trusted_payment_lookup:['p_id','p_wallet','p_ref','p_merchant'],
  trusted_verification_claim:['p_attempt','p_transaction','p_user'],trusted_verification_record:['p_attempt','p_amount','p_merchant','p_ref','p_transaction'],trusted_payment_settle:['p_attempt','p_amount','p_merchant','p_ref','p_transaction'],
  trusted_wallet_checkout:['p_user','p_key','p_request','p_quote'],trusted_wallet_receipt:['p_order','p_user'],
 };
 const admin=()=>({
  async rpc(name,args){
   assert.ok(Object.hasOwn(signatures,name),'Unapproved local RPC');assert.deepEqual(Object.keys(args).sort(),[...signatures[name]].sort());
   const values=signatures[name].map(p=>lit(typeof args[p]==='object'&&args[p]!==null?JSON.stringify(args[p]):args[p]));
   try{return {data:json(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${values.join(',')}))`),error:null};}catch{return {data:null,error:{message:'Synthetic database rejection'}};}
  },
  from(table){assert.equal(table,'orders');const filters={};return {select(columns){assert.equal(columns,'id,user_id,payment_state,payment_method,payment_trans_id');return this;},eq(k,v){assert.ok(['id','user_id'].includes(k));filters[k]=v;return this;},async maybeSingle(){assert.equal(Object.keys(filters).length,2);return {data:json(`SET ROLE service_role;SELECT coalesce((SELECT to_jsonb(o) FROM (SELECT id,user_id,payment_state,payment_method,payment_trans_id FROM public.orders WHERE id=${lit(filters.id)} AND user_id=${lit(filters.user_id)}) o),'null'::jsonb)`)};}};},
 });
 const auth=async token=>token==='Bearer fixture-owner'?{id:user}:token==='Bearer fixture-other'?{id:other}:token==='Bearer fixture-old'?{id:historical}:null;
 const wire=[];
 const provider=createBitpayProvider({environment:'production',credentialEnvironment:'production',apiKey:'k'.repeat(52),merchant:'http-fixture',callbackOrigin:'https://shop.invalid',newPaymentsEnabled:true,
  fetchImpl:async(url,options)=>{wire.push({url,fields:new URLSearchParams(options.body)});return {ok:true,text:async()=> '977001',json:async()=>({status:1,amount:50000})};}});
 const app=express();app.use(express.json({limit:'32kb'}));app.use('/api/wallet',createWalletRouter({admin,auth,enabled:true,topupsEnabled:true}));app.use('/api/bitpay',createPaymentRouter({admin,auth,provider,merchant:()=> 'http-fixture',topupsEnabled:true,recoveryEnabled:false}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const origin=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,body,token='fixture-owner')=>{const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});return {status:res.status,body:await res.json()};};
  assert.equal((await request('/api/wallet/summary',undefined,'bad')).status,401);
  let view=(await request('/api/wallet/summary')).body;assert.equal(view.balance,0);assert.equal(view.topupsEnabled,true);assert.equal(view.spendingEnabled,false);
  assert.equal((await request('/api/wallet/summary',undefined,'fixture-old')).body.topupsEnabled,false);
  assert.equal((await request('/api/bitpay/wallet-init',{idempotencyKey:key,amount:50000,userId:other})).status,400);assert.equal(wire.length,0);
  const start=await request('/api/bitpay/wallet-init',{idempotencyKey:key,amount:50000});assert.equal(start.status,200);const topup=start.body.topupId;assert.equal(start.body.redirectUrl,'https://bitpay.ir/payment/gateway-977001-get');
  assert.equal(wire.length,1);assert.equal(wire[0].fields.get('amount'),'50000');assert.equal(wire[0].fields.get('redirect'),'https://shop.invalid/account/wallet/verify?topup_id='+topup);
  assert.equal((await request('/api/bitpay/wallet-init',{idempotencyKey:key,amount:50000})).body.topupId,topup);assert.equal(wire.length,1,'Retry must not recreate provider request');
  const callback={topup_id:topup,id_get:'977001',trans_id:'977002'};
  assert.equal((await request('/api/bitpay/wallet-verify',callback,'fixture-other')).body.success,false);assert.equal(wire.length,1);
  assert.equal((await request('/api/bitpay/wallet-verify',callback)).body.success,true);assert.equal(wire.length,2);
  assert.equal((await request('/api/bitpay/wallet-verify',callback)).body.success,true);assert.equal(wire.length,2,'Settled replay must not verify again');
  assert.equal((await request('/api/bitpay/wallet-topups/'+topup+'/status')).body.paid,true);
  assert.equal((await request('/api/bitpay/wallet-topups/'+topup+'/status',undefined,'fixture-other')).status,404);
  view=(await request('/api/wallet/summary')).body;assert.equal(view.balance,50000);assert.equal(view.spendingEnabled,true);assert.equal(view.entries.length,1);
  const selection={addressId:address,shippingOption:'tipax',items:[{productId:product,quantity:1}]},orderKey=randomUUID();
  const quote=(await request('/api/wallet/checkout/quote',{idempotencyKey:orderKey,selection})).body;assert.equal(quote.total,20000);
  const purchase={idempotencyKey:orderKey,selection,quote:quote.quote};const paid=(await request('/api/wallet/checkout',purchase)).body;assert.equal(paid.success,true);
  assert.equal((await request('/api/wallet/checkout',purchase)).body.alreadyPaid,true);
  assert.equal((await request('/api/bitpay/orders/'+paid.orderId+'/status')).body.paid,true);
  assert.equal((await request('/api/bitpay/orders/'+paid.orderId+'/status',undefined,'fixture-other')).status,404);
  view=(await request('/api/wallet/summary')).body;assert.equal(view.balance,30000);assert.equal(view.entries.length,2);assert.equal(wire.length,2,'Wallet purchase makes no provider request');
  assert.deepEqual(json(`SELECT jsonb_build_object('origin',(SELECT count(*) FROM checkout_private.wallet_zero_origins WHERE user_id='${user}'),'credit',(SELECT count(*) FROM checkout_private.wallet_credits WHERE user_id='${user}'),'consistent',(public.trusted_wallet_reconcile('${user}')->>'consistent')::boolean)`),{origin:1,credit:1,consistent:true});
  query('UPDATE checkout_private.wallet_control SET topups_enabled=false,spending_enabled=false');
  view=(await request('/api/wallet/summary')).body;assert.equal(view.topupsEnabled,false);assert.equal(view.spendingEnabled,false);
  assert.equal((await request('/api/bitpay/wallet-topups/'+topup+'/status')).body.paid,true,'Closing gates preserves receipts');
  console.log('PASS: real local HTTP + PostgreSQL wallet lifecycle: prospective identity, one mocked gateway create/verify, owned credit receipt, server quote, atomic purchase, retry, history and closed gates.');
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});query('UPDATE checkout_private.wallet_control SET topups_enabled=false,spending_enabled=false');}
}
