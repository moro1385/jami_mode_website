import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createInventoryRouter} from '../server/inventory-routes.js';
export async function runInventoryFollowupTests({psql,interactive}){
 let assertions=0,races=0;
 const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 const service=sql=>'SET ROLE service_role;'+sql;
 const json=sql=>JSON.parse(query(service(sql)));
 const check=(a,b)=>{assert.deepEqual(a,b);assertions++;};
 const reject=(sql,code)=>{let failure;try{query(sql);}catch(e){failure=e;}assert.ok(failure);assert.ok(String(failure.stderr??failure.message).includes(code),String(failure.stderr??failure.message));assertions++;};
 const admin=randomUUID(),other=randomUUID(),customer=randomUUID(),product=randomUUID(),variant=randomUUID(),address=randomUUID();
 query(`INSERT INTO auth.users(id) VALUES('${admin}'),('${other}'),('${customer}');INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin'),('${other}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Followup fixture','followup-${product}',10000,true);INSERT INTO public.product_variants(id,product_id,size,color,sku,stock_quantity) VALUES('${variant}','${product}','M','red','followup-${variant}',5);INSERT INTO public.addresses(id,user_id,line1,city) VALUES('${address}','${customer}','Synthetic street','Tehran');UPDATE inventory_private.settings SET policies_enabled=true`);
 const policy=(rev,threshold)=>json(`SELECT public.trusted_inventory_policy_set('${admin}','${randomUUID()}','${product}','${variant}',${rev},${threshold},'followup fixture policy')`);
 policy(0,10);
 const read=(actor=admin)=>`SELECT public.trusted_inventory_followup('${actor}','${product}','${variant}')`;
 const current=()=>json(read());
 const set=(c,key=randomUUID(),status='reviewed',actor=admin,reason='checked stock context')=>`SELECT public.trusted_inventory_followup_set('${actor}','${key}','${product}','${variant}','${c.inventoryRevision}',${c.policyRevision},${c.revision},'${status}',${quote(reason)})`;
 const history=(before=null,limit=20)=>json(`SELECT public.trusted_inventory_followup_history('${admin}','${product}','${variant}',${before?quote(before.createdAt):'NULL'},${before?quote(before.id):'NULL'},${limit})`);
 const token=()=>query(`SELECT inventory_revision FROM public.product_variants WHERE id='${variant}'`);
 const stock=n=>query(`UPDATE public.product_variants SET stock_quantity=${n} WHERE id='${variant}'`);
 check(current().canWrite,false);check(current().status,'open');check(current().revision,0);check(history().entries,[]);
 reject(service(set(current())),'FOLLOWUP_DISABLED');
 for(const role of ['anon','authenticated']){
  reject(`SET ROLE ${role};${read()}`,'permission denied');reject(`SET ROLE ${role};${set(current())}`,'permission denied');
  reject(`SET ROLE ${role};SELECT public.trusted_inventory_followup_history('${admin}','${product}','${variant}')`,'permission denied');
  for(const table of ['alert_followups','alert_followup_events'])reject(`SET ROLE ${role};SELECT * FROM inventory_private.${table}`,'permission denied');
 }
 reject(service(read(customer)),'INVENTORY_FORBIDDEN');
 query('UPDATE inventory_private.settings SET followups_enabled=true');
 const initial=current(),key=randomUUID(),receipt=json(set(initial,key));
 check(current().status,'reviewed');check(current().alert,'low');check(current().quantity,5);check(current().revision,1);check(current().contextChanged,false);
 check(json(set(initial,key)),receipt);check(history().entries.length,1);reject(service(set(initial,key,'open')),'FOLLOWUP_CONFLICT');reject(service(set(initial)),'FOLLOWUP_STALE_REVISION');
 // Price and no-op updates preserve context; metadata and actual stock updates replace it.
 const before=token();query(`UPDATE public.product_variants SET price=12000,stock_quantity=5,inventory_revision='${randomUUID()}' WHERE id='${variant}'`);check(token(),before);
 reject(`SET ROLE authenticated;SET request.jwt.claim.sub='${admin}';UPDATE public.product_variants SET inventory_revision='${randomUUID()}' WHERE id='${variant}'`,'permission denied');
 query(`SET ROLE authenticated;SET request.jwt.claim.sub='${admin}';UPDATE public.product_variants SET sku='followup-edited-${variant}' WHERE id='${variant}'`);
 check(token()===before,false);check(current().contextChanged,true);check(current().status,'open');reject(service(set({...initial,revision:1})),'FOLLOWUP_STALE_CONTEXT');
 const metadataReceipt=json(set(current()));check(metadataReceipt.beforeStatus,'open');
 const reviewed=current();stock(7);stock(5);check(token()===reviewed.inventoryRevision,false);check(current().status,'open');check(current().contextChanged,true);reject(service(set(reviewed)),'FOLLOWUP_STALE_CONTEXT');
 json(set(current()));policy(1,10);check(current().status,'open');check(current().contextChanged,true);json(set(current()));
 stock(20);check(current().alert,'none');check(current().canWrite,false);reject(service(set(current())),'FOLLOWUP_INACTIVE');stock(5);
 // Invalid legacy quantities remain explicit and can be reviewed without being silently repaired.
 stock(-1);check(current().alert,'invalid');check(current().quantity,null);check(json(set(current())).quantity,null);stock(5);
 const raceContext=current(),writer=interactive(),contender=interactive(),app='followup-race-'+randomUUID();const done=contender.done.then(output=>({output}),error=>({error}));
 try{
  writer.child.stdin.write(`BEGIN;SET ROLE service_role;${set(raceContext)};\n\\echo FOLLOWUP_HELD\n`);await writer.until('FOLLOWUP_HELD');
  contender.child.stdin.write(`SET application_name='${app}';BEGIN;SET ROLE service_role;${set(raceContext,randomUUID(),'in_progress',other)};\n`);
  let waiting=false;for(let i=0;i<40;i++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND wait_event_type='Lock'`)==='1'){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}check(waiting,true);
  writer.child.stdin.end('COMMIT;');await writer.done;contender.child.stdin.end('COMMIT;');const result=await done;assert.ok(result.error);assert.ok(String(result.error).includes('FOLLOWUP_STALE_REVISION'));assertions++;races++;
 }finally{writer.child.kill();contender.child.kill();}
 const auditBefore=current();query("CREATE FUNCTION inventory_private.fixture_followup_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic followup audit failure';END$$;CREATE TRIGGER fixture_followup_failure BEFORE INSERT ON inventory_private.alert_followup_events FOR EACH ROW EXECUTE FUNCTION inventory_private.fixture_followup_failure()");
 reject(service(set(auditBefore,randomUUID(),'open')),'synthetic followup audit failure');check(current(),auditBefore);
 query('DROP TRIGGER fixture_followup_failure ON inventory_private.alert_followup_events;DROP FUNCTION inventory_private.fixture_followup_failure()');
 // Actual trusted checkout reduces stock and expiry restores it; both invalidate an old review.
 query(`UPDATE public.product_variants SET sku='followup-${variant}' WHERE id='${variant}'`);json(set(current()));const checkoutToken=token();
 const checkoutKey=randomUUID(),request=JSON.stringify({addressId:address,shippingOption:'express',items:[{productId:product,variantId:variant,quantity:2,size:'M',color:'red'}]});
 const quoted=json(`SELECT public.trusted_checkout('${customer}','${checkoutKey}',${quote(request)},NULL)`);
 const order=json(`SELECT public.trusted_checkout('${customer}','${checkoutKey}',${quote(request)},${quote(quoted.quote)})`).orderId;
 check(current().quantity,3);check(token()===checkoutToken,false);check(current().status,'open');json(set(current()));const reserveToken=token();
 query(`UPDATE checkout_private.reservations SET expires_at=now()-interval '1 minute' WHERE order_id='${order}'`);check(Number(query(service(`SELECT public.trusted_expire_unstarted('${customer}',50)`))),1);
 check(current().quantity,5);check(token()===reserveToken,false);check(current().status,'open');
 const expiryToken=token();check(Number(query(service(`SELECT public.trusted_expire_unstarted('${customer}',50)`))),0);check(token(),expiryToken);
 for(let i=0;i<23;i++)json(set(current(),randomUUID(),i%2?'reviewed':'in_progress'));
 const page1=history(),page2=history(page1.entries.at(-1));check(page1.entries.length,20);check(page1.hasMore,true);check(page2.hasMore,false);check(new Set([...page1.entries,...page2.entries].map(e=>e.id)).size,page1.entries.length+page2.entries.length);
 for(const action of ['UPDATE inventory_private.alert_followup_events SET receipt=receipt','DELETE FROM inventory_private.alert_followup_events','TRUNCATE inventory_private.alert_followup_events'])reject(service(action),'permission denied');
 reject('DELETE FROM inventory_private.alert_followup_events','append-only');
 check(Number(query("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname LIKE 'trusted_inventory_followup%' AND p.prosecdef")),0);
 // Real HTTP -> trusted SQL, loopback only. No hosted service/auth or payment request.
 const appServer=express();appServer.use(express.json());appServer.use('/inventory',createInventoryRouter({followupsEnabled:true,auth:async header=>header==='Bearer synthetic-admin'?{user:{id:admin},admin:true}:null,admin:()=>({rpc:async(name,args)=>{
  if(name==='trusted_inventory_followup')return{data:json(read(args.p_actor))};
  if(name==='trusted_inventory_followup_set')return{data:json(set({inventoryRevision:args.p_inventory_revision,policyRevision:args.p_policy_revision,revision:args.p_revision},args.p_key,args.p_status,args.p_actor,args.p_reason))};
  if(name==='trusted_inventory_followup_history')return{data:history(args.p_before?{createdAt:args.p_before,id:args.p_before_id}:null)};
  throw Error('Unexpected RPC');
 }})}));
 const server=await new Promise(resolve=>{const listener=appServer.listen(0,'127.0.0.1',()=>resolve(listener));});
 try{
  const base=`http://127.0.0.1:${server.address().port}/inventory/followup`,qs=`?productId=${product}&variantId=${variant}`,headers={Authorization:'Bearer synthetic-admin','Content-Type':'application/json'};
  check((await fetch(base+qs,{signal:AbortSignal.timeout(5000)})).status,401);
  const response=await fetch(base+qs,{headers,signal:AbortSignal.timeout(5000)});check(response.status,200);check(response.headers.get('cache-control'),'no-store');check((await response.json()).revision,current().revision);
  const c=current(),res=await fetch(base,{method:'POST',headers,body:JSON.stringify({productId:product,variantId:variant,inventoryRevision:c.inventoryRevision,policyRevision:c.policyRevision,expectedRevision:c.revision,status:'reviewed',reason:'HTTP fixture review',idempotencyKey:randomUUID()}),signal:AbortSignal.timeout(5000)});check(res.status,200);check((await res.json()).status,'reviewed');
  const h=await fetch(base+'/history'+qs,{headers,signal:AbortSignal.timeout(5000)});check(h.status,200);check((await h.json()).entries.length,20);
 }finally{await new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();});}
 query('UPDATE inventory_private.settings SET followups_enabled=false');check(json(set(initial,key)),receipt);reject(service(set(current())),'FOLLOWUP_DISABLED');
 query(`DELETE FROM public.user_roles WHERE user_id='${admin}'`);reject(service(set(initial,key)),'INVENTORY_FORBIDDEN');
 const missing=randomUUID();query(`INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');UPDATE inventory_private.settings SET followups_enabled=true;INSERT INTO public.product_variants(id,product_id,size,stock_quantity) VALUES('${missing}','${product}','L',1)`);
 json(`SELECT public.trusted_inventory_policy_set('${admin}','${randomUUID()}','${product}','${missing}',0,10,'missing entity fixture')`);
 const missingToken=query(`SELECT inventory_revision FROM public.product_variants WHERE id='${missing}'`);
 json(`SELECT public.trusted_inventory_followup_set('${admin}','${randomUUID()}','${product}','${missing}','${missingToken}',1,0,'reviewed','before entity removal')`);
 query(`DELETE FROM public.product_variants WHERE id='${missing}'`);
 const missingContext=json(`SELECT public.trusted_inventory_followup('${admin}','${product}','${missing}')`);
 check(missingContext.alert,'missing');check(missingContext.canWrite,false);check(missingContext.status,'open');check(json(`SELECT public.trusted_inventory_followup_history('${admin}','${product}','${missing}')`).entries.length,1);check(history().entries.length,20);
 console.log('INVENTORY_FOLLOWUP_DB_TEST_REPORT '+JSON.stringify({assertions,races,passed:true,productionAccess:false}));
}
