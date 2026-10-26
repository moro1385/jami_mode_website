import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createInventoryRouter} from '../server/inventory-routes.js';
export async function runInventoryBalanceTests({psql,interactive}){
 let assertions=0,races=0;
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 const check=(value,expected)=>{assert.deepEqual(value,expected);assertions++;};
 const reject=(sql,code)=>{let failure;try{query(sql);}catch(error){failure=error;}assert.ok(failure);assert.ok(String(failure.stderr??failure.message).includes(code));assertions++;};
 const actor=randomUUID(),user=randomUUID(),product=randomUUID(),variant=randomUUID(),address=randomUUID();
 const service=sql=>'SET ROLE service_role;'+sql;
 const json=sql=>JSON.parse(query(service(sql)));
 const call=(who=actor,prod=product,v=variant)=>`SELECT public.trusted_inventory_balance('${who}','${prod}','${v}')`;
 const balance=()=>json(call());
 const numbers=()=>{const b=balance();return[b.available,b.reserved,b.overdue,b.paid,b.released,b.legacy,b.reviewLines];};
 query(`INSERT INTO auth.users(id) VALUES('${actor}'),('${user}');INSERT INTO public.user_roles(user_id,role) VALUES('${actor}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Balance fixture','balance-${product}',10000,true);INSERT INTO public.product_variants(id,product_id,size,color,sku,stock_quantity) VALUES('${variant}','${product}','M','red','balance-${variant}',10);INSERT INTO public.addresses(id,user_id,line1,city) VALUES('${address}','${user}','Synthetic street','Tehran')`);
 check(numbers(),[10,'0','0','0','0','0','0']);check(balance().saleEnabled,true);
 for(const role of ['anon','authenticated'])reject(`SET ROLE ${role};${call()}`,'permission denied');
 reject(service(call(user)),'INVENTORY_FORBIDDEN');reject(service(call(actor,randomUUID())),'INVENTORY_NOT_FOUND');
 const makeOrder=quantity=>{
  const key=randomUUID(),request=JSON.stringify({addressId:address,shippingOption:'express',items:[{productId:product,variantId:variant,quantity,size:'M',color:'red'}]});
  const quoteResult=json(`SELECT public.trusted_checkout('${user}','${key}',${quote(request)},NULL)`);
  return json(`SELECT public.trusted_checkout('${user}','${key}',${quote(request)},${quote(quoteResult.quote)})`).orderId;
 };
 const first=makeOrder(2);check(numbers(),[8,'2','0','0','0','0','0']);
 query(`UPDATE checkout_private.reservations SET expires_at=now()-interval '1 minute' WHERE order_id='${first}'`);
 const before=query(`SELECT row_to_json(r) FROM checkout_private.reservations r WHERE order_id='${first}'`);
 check(numbers(),[8,'2','2','0','0','0','0']);check(query(`SELECT row_to_json(r) FROM checkout_private.reservations r WHERE order_id='${first}'`),before);
 const attempt=json(`SELECT public.trusted_payment_claim('${first}','${user}','balance-fixture')`);
 check(Number(query(service(`SELECT public.trusted_expire_unstarted('${user}',50)`))),0);check(numbers(),[8,'2','2','0','0','0','0']);
 json(`SELECT public.trusted_payment_attach('${attempt.id}','984100001')`);
 json(`SELECT public.trusted_payment_settle('${attempt.id}',${attempt.amount},'balance-fixture','984100001','984100002')`);
 check(numbers(),[8,'0','0','2','0','0','0']);
 const second=makeOrder(3);check(numbers(),[5,'3','0','2','0','0','0']);
 query(`UPDATE checkout_private.reservations SET expires_at=now()-interval '1 minute' WHERE order_id='${second}'`);
 check(Number(query(service(`SELECT public.trusted_expire_unstarted('${user}',50)`))),1);check(numbers(),[8,'0','0','2','3','0','0']);
 check(Number(query(service(`SELECT public.trusted_expire_unstarted('${user}',50)`))),0);check(numbers(),[8,'0','0','2','3','0','0']);
 // Read while an actual concurrent session has uncommitted stock/payment writes.
 const third=makeOrder(1),writer=interactive();
 try{
  writer.child.stdin.write(`BEGIN;UPDATE public.product_variants SET stock_quantity=12 WHERE id='${variant}';UPDATE public.orders SET payment_state='paid',status='confirmed' WHERE id='${third}';\n\\echo BALANCE_WRITE_HELD\n`);
  await writer.until('BALANCE_WRITE_HELD');check(numbers(),[7,'1','0','2','3','0','0']);
  writer.child.stdin.end('COMMIT;');await writer.done;check(numbers(),[12,'0','0','3','3','0','0']);races++;
 }finally{writer.child.kill();}
 query(`UPDATE public.products SET is_active=false WHERE id='${product}'`);check(balance().saleEnabled,false);
 query(`UPDATE public.product_variants SET stock_quantity=-1 WHERE id='${variant}'`);check(balance().available,null);
 query(`UPDATE public.product_variants SET stock_quantity=12 WHERE id='${variant}';UPDATE checkout_private.reservations SET released_at=now() WHERE order_id='${third}'`);
 check(balance().reviewLines,'1');check(balance().released,'3');
 const legacy=randomUUID(),untracked=randomUUID();
 query(`INSERT INTO public.orders(id,user_id,total_amount,checkout_version,status,payment_method,payment_state,shipping_cost) VALUES('${legacy}','${user}',70000,1,'pending','gateway','legacy',0),('${untracked}','${user}',10000,2,'pending_payment','gateway','pending',0);INSERT INTO public.order_items(order_id,product_id,variant_id,quantity,price) VALUES('${legacy}','${product}','${variant}',7,10000),('${untracked}','${product}','${variant}',1,10000)`);
 check(balance().legacy,'7');check(balance().reviewLines,'2');check(balance().available,12);
 const app=express();app.use('/inventory',createInventoryRouter({enabled:false,reportsEnabled:true,auth:async header=>header==='Bearer synthetic-admin'?{user:{id:actor},admin:true}:null,admin:()=>({rpc:async(name,args)=>{assert.equal(name,'trusted_inventory_balance');return{data:json(call(args.p_actor,args.p_product,args.p_variant))};}})}));
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 try{
  const base=`http://127.0.0.1:${server.address().port}/inventory/balance?productId=${product}&variantId=${variant}`;
  check((await fetch(base,{signal:AbortSignal.timeout(5000)})).status,401);
  const response=await fetch(base,{headers:{Authorization:'Bearer synthetic-admin'},signal:AbortSignal.timeout(5000)});check(response.status,200);check(response.headers.get('cache-control'),'no-store');const value=await response.json();check(value.available,12);check(value.legacy,'7');check(Object.hasOwn(value,'user_id'),false);
 }finally{await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
 query(`DELETE FROM public.user_roles WHERE user_id='${actor}'`);reject(service(call()),'INVENTORY_FORBIDDEN');
 console.log('INVENTORY_BALANCE_DB_TEST_REPORT '+JSON.stringify({assertions,races,passed:true,productionAccess:false}));
}
