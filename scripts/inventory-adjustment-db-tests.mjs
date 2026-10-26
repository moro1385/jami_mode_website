import express from 'express';
import {createInventoryRouter} from '../server/inventory-routes.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runInventoryAdjustmentTests({psql,interactive}){
 let assertions=0,races=0;
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 const check=(value,expected)=>{assert.deepEqual(value,expected);assertions++;};
 const reject=(sql,expected)=>{let caught;try{query(sql);}catch(error){caught=error;}assert.ok(caught,'Expected SQL rejection');if(expected)assert.ok(String(caught.stderr??caught.message).includes(expected),String(caught.stderr??caught.message));assertions++;};
 const actor=randomUUID(),user=randomUUID(),product=randomUUID(),variant=randomUUID(),address=randomUUID();
 const snapshot=quantity=>({quantity,sku:'SKU-atomic',size:'M',color:'red'});
 const call=(key,expected,delta=1,reason='count correction',who=actor,prod=product,v=variant)=>`SELECT public.trusted_inventory_adjust('${who}','${key}','${prod}','${v}',${quote(JSON.stringify(expected))},${delta},${quote(reason)})`;
 const service=sql=>'SET ROLE service_role;'+sql;
 const stock=()=>Number(query(`SELECT stock_quantity FROM public.product_variants WHERE id='${variant}'`));
 const count=()=>Number(query(`SELECT count(*) FROM inventory_private.adjustments WHERE product_id='${product}'`));
 const json=sql=>JSON.parse(query(service(sql)));
 query(`INSERT INTO auth.users(id) VALUES('${actor}'),('${user}');INSERT INTO public.user_roles(user_id,role) VALUES('${actor}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Atomic inventory','atomic-${product}',10000,true);INSERT INTO public.product_variants(id,product_id,size,color,sku,stock_quantity) VALUES('${variant}','${product}','M','red','SKU-atomic',10);INSERT INTO public.addresses(id,user_id,line1,city) VALUES('${address}','${user}','Fixture street','Tehran')`);
 check(json(`SELECT public.trusted_inventory_status('${actor}')`),{version:1,adjustmentsEnabled:false});
 reject(service(call(randomUUID(),snapshot(10))),'INVENTORY_DISABLED');check(stock(),10);check(count(),0);
 for(const role of ['anon','authenticated']){
  reject(`SET ROLE ${role};SELECT public.trusted_inventory_status('${actor}')`,'permission denied');
  reject(`SET ROLE ${role};${call(randomUUID(),snapshot(10))}`,'permission denied');
  reject(`SET ROLE ${role};SELECT * FROM inventory_private.adjustments`,'permission denied');
 }
 reject(service(`SELECT public.trusted_inventory_status('${user}')`),'INVENTORY_FORBIDDEN');
 reject(service(call(randomUUID(),snapshot(10),1,'count correction',user)),'INVENTORY_FORBIDDEN');
 query('UPDATE inventory_private.settings SET adjustments_enabled=true');
 for(const delta of [0,-11,1000001])reject(service(call(randomUUID(),snapshot(10),delta)),'INVENTORY_INVALID');
 for(const reason of ['xx','bad\nreason','x'.repeat(501)])reject(service(call(randomUUID(),snapshot(10),1,reason)),'INVENTORY_INVALID');
 for(const expected of [{...snapshot(10),extra:1},{quantity:10,sku:'SKU-atomic',size:'M'},{...snapshot(10),quantity:'10'},{...snapshot(10),quantity:-1},{...snapshot(10),quantity:2147483648}])reject(service(call(randomUUID(),expected)),'INVENTORY_INVALID');
 reject(service(call(randomUUID(),snapshot(9))),'INVENTORY_STALE');reject(service(call(randomUUID(),snapshot(10),1,'count correction',actor,randomUUID())),'INVENTORY_NOT_FOUND');check(stock(),10);check(count(),0);
 const key=randomUUID(),first=json(call(key,snapshot(10),-2));check(first.before,10);check(first.after,8);check(first.actorId,actor);check(first.variantId,variant);check(stock(),8);check(count(),1);
 check(json(call(key,snapshot(10),-2)),first);check(stock(),8);check(count(),1);
 json(call(randomUUID(),snapshot(8),3));check(stock(),11);check(json(call(key,snapshot(10),-2)),first);check(stock(),11);
 reject(service(call(key,snapshot(10),-1)),'INVENTORY_REQUEST_CONFLICT');
 query(`UPDATE public.product_variants SET sku='changed-code' WHERE id='${variant}'`);reject(service(call(randomUUID(),snapshot(11))),'INVENTORY_STALE');query(`UPDATE public.product_variants SET sku='SKU-atomic' WHERE id='${variant}'`);check(count(),2);
 for(let index=0;index<25;index++)json(call(randomUUID(),snapshot(stock()),1,'count correction '+index));
 const history=(before=null,beforeId=null)=>json(`SELECT public.trusted_inventory_history('${actor}','${product}','${variant}',${before?quote(before):'NULL'},${beforeId?quote(beforeId):'NULL'},20)`);
 const recent=history();check(recent.entries.length,20);check(recent.hasMore,true);const last=recent.entries.at(-1),older=history(last.createdAt,last.id);check(older.entries.length,7);check(older.hasMore,false);check(new Set([...recent.entries,...older.entries].map(entry=>entry.id)).size,27);
 reject(service(`SELECT public.trusted_inventory_history('${actor}','${product}','${variant}',NULL,NULL,1000)`),'INVENTORY_INVALID');
 reject(service(`SELECT public.trusted_inventory_history('${actor}','${product}','${variant}',NULL,'${randomUUID()}',20)`),'INVENTORY_INVALID');
 for(const operation of ["UPDATE inventory_private.adjustments SET reason='tampered'",'DELETE FROM inventory_private.adjustments','TRUNCATE inventory_private.adjustments','UPDATE inventory_private.settings SET adjustments_enabled=false'])reject(service(operation),'permission denied');
 reject("UPDATE inventory_private.adjustments SET reason='tampered'",'append-only');
 const prior=stock(),priorCount=count();
 query(`CREATE FUNCTION inventory_private.fixture_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.reason='force ledger failure' THEN RAISE EXCEPTION 'synthetic ledger rejection'; END IF;RETURN NEW;END$$;CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON inventory_private.adjustments FOR EACH ROW EXECUTE FUNCTION inventory_private.fixture_reject_audit()`);
 reject(service(call(randomUUID(),snapshot(prior),1,'force ledger failure')),'synthetic ledger rejection');check(stock(),prior);check(count(),priorCount);
 query('DROP TRIGGER fixture_audit_failure ON inventory_private.adjustments;DROP FUNCTION inventory_private.fixture_reject_audit()');
 query('UPDATE inventory_private.settings SET adjustments_enabled=false');check(json(call(key,snapshot(10),-2)),first);reject(service(call(randomUUID(),snapshot(stock()))),'INVENTORY_DISABLED');
 query(`DELETE FROM public.user_roles WHERE user_id='${actor}'`);reject(service(call(key,snapshot(10),-2)),'INVENTORY_FORBIDDEN');query(`INSERT INTO public.user_roles(user_id,role) VALUES('${actor}','admin');UPDATE inventory_private.settings SET adjustments_enabled=true`);
 async function compete(firstCommand,secondCommand,secondReject){
  const a=interactive(),b=interactive(),app='inventory-race-'+randomUUID();
  const resultB=b.done.then(output=>({output}),error=>({error}));
  try{
   a.child.stdin.write(`BEGIN;SET ROLE service_role;${firstCommand};\n\\echo INVENTORY_FIRST_HELD\n`);await a.until('INVENTORY_FIRST_HELD');
   b.child.stdin.write(`SET application_name='${app}';BEGIN;SET ROLE service_role;\n\\echo INVENTORY_SECOND_STARTED\n${secondCommand};\n`);await b.until('INVENTORY_SECOND_STARTED');
   let blocked=false;for(let n=0;n<30;n++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND wait_event_type='Lock'`)==='1'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}check(blocked,true);
   a.child.stdin.end('COMMIT;');const outputA=await a.done;b.child.stdin.end('COMMIT;');const result=await resultB;
   if(secondReject){assert.ok(result.error);assert.ok(String(result.error).includes(secondReject),String(result.error));assertions++;}else{assert.ok(!result.error,String(result.error));assertions++;}
   races++;return{outputA,outputB:result.output};
  }finally{a.child.kill();b.child.kill();}
 }
 // Two actual sessions replay one request exactly once.
 const beforeReplay=stock(),countReplay=count(),sameKey=randomUUID();const replay=await compete(call(sameKey,snapshot(beforeReplay)),call(sameKey,snapshot(beforeReplay)));
 const receipt=output=>JSON.parse(output.split(/\r?\n/).find(line=>line.startsWith('{')));check(receipt(replay.outputA),receipt(replay.outputB));check(stock(),beforeReplay+1);check(count(),countReplay+1);
 const beforeStale=stock(),countStale=count();await compete(call(randomUUID(),snapshot(beforeStale)),call(randomUUID(),snapshot(beforeStale)),'INVENTORY_STALE');check(stock(),beforeStale+1);check(count(),countStale+1);
 // Actual checkout reservation and expiry routines, not simulated stock updates.
 const request=JSON.stringify({addressId:address,shippingOption:'express',items:[{productId:product,variantId:variant,quantity:2,size:'M',color:'red'}]});
 const checkout=(key,proof)=>`SELECT public.trusted_checkout('${user}','${key}',${quote(request)},${proof?quote(proof):'NULL'})`;
 const orderKey=randomUUID(),proof=json(checkout(orderKey,null)).quote,beforeOrder=stock(),countOrder=count();
 const orderRace=await compete(checkout(orderKey,proof),call(randomUUID(),snapshot(beforeOrder)),'INVENTORY_STALE');const order=receipt(orderRace.outputA).orderId;check(stock(),beforeOrder-2);check(count(),countOrder);
 query(`UPDATE checkout_private.reservations SET expires_at=now()-interval '1 second' WHERE order_id='${order}'`);
 const beforeExpiry=stock();await compete(`SELECT public.trusted_expire_unstarted('${user}',50)`,call(randomUUID(),snapshot(beforeExpiry)),'INVENTORY_STALE');check(stock(),beforeOrder);check(count(),countOrder);check(Number(query(service(`SELECT public.trusted_expire_unstarted('${user}',50)`))),0);check(stock(),beforeOrder);
 const soldOutKey=randomUUID(),soldOutProof=json(checkout(soldOutKey,null)).quote,beforeSoldOut=stock(),countSoldOut=count();
 await compete(call(randomUUID(),snapshot(beforeSoldOut),-beforeSoldOut,'damaged stock removed'),checkout(soldOutKey,soldOutProof),'Insufficient stock');check(stock(),0);check(count(),countSoldOut+1);check(Number(query(`SELECT count(*) FROM checkout_private.requests WHERE user_id='${user}' AND key='${soldOutKey}'`)),0);
 // Real loopback HTTP -> actual migration functions in this temporary database.
 let loseResponse=true,rpcCalls=0;
 const rpc=async(name,args)=>{
  rpcCalls++;
  try{
   let result;
   if(name==='trusted_inventory_status')result=json(`SELECT public.trusted_inventory_status('${args.p_actor}')`);
   else if(name==='trusted_inventory_adjust')result=json(call(args.p_key,args.p_expected,args.p_delta,args.p_reason,args.p_actor,args.p_product,args.p_variant));
   else if(name==='trusted_inventory_history')result=json(`SELECT public.trusted_inventory_history('${args.p_actor}','${args.p_product}','${args.p_variant}',${args.p_before?quote(args.p_before):'NULL'},${args.p_before_id?quote(args.p_before_id):'NULL'},${args.p_limit})`);
   else throw Error('Unexpected RPC');
   if(name==='trusted_inventory_adjust'&&loseResponse){loseResponse=false;return{error:{code:'08006',message:'Synthetic response lost after commit'}};}
   return{data:result};
  }catch(error){const message=String(error.stderr??error.message);const known=message.match(/INVENTORY_(STALE|REQUEST_CONFLICT|FORBIDDEN|DISABLED|NOT_FOUND|INVALID)/);return{error:{code:known?'P0001':'XX000',message:known?.[0]??'Synthetic database failure'}};}
 };
 const app=express();app.use(express.json({limit:'32kb'}));app.use('/inventory',createInventoryRouter({enabled:true,auth:async header=>header==='Bearer synthetic-admin'?{user:{id:actor},admin:true}:null,admin:()=>({rpc})}));
 const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 try{
  const base=`http://127.0.0.1:${server.address().port}/inventory`,headers={authorization:'Bearer synthetic-admin','content-type':'application/json'};
  const command={productId:product,variantId:variant,expected:snapshot(0),delta:5,reason:'HTTP count correction',idempotencyKey:randomUUID()},priorCount=count();
  const send=body=>fetch(base+'/adjustments',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  const beforeDenied=rpcCalls;check((await fetch(base+'/status')).status,401);check(rpcCalls,beforeDenied);
  const lost=await send(command);check(lost.status,503);check((await lost.json()).code,'INVENTORY_RESULT_UNCONFIRMED');check(stock(),5);check(count(),priorCount+1);
  const recovered=await send(command);check(recovered.status,200);const receipt=(await recovered.json()).entry;check(receipt.actorId,actor);check(receipt.after,5);check(stock(),5);check(count(),priorCount+1);
  check((await send({...command,reason:'different request'})).status,409);
  const response=await fetch(base+`/history?productId=${product}&variantId=${variant}`,{headers,signal:AbortSignal.timeout(5000)});check(response.status,200);const history=await response.json();check(history.entries.some(entry=>entry.requestId===command.idempotencyKey),true);check(history.entries[0].id,receipt.id);
 }finally{await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
 query('UPDATE inventory_private.settings SET adjustments_enabled=false');
 console.log('INVENTORY_DB_TEST_REPORT ' +JSON.stringify({assertions,races,passed:true,productionAccess:false}));
}
