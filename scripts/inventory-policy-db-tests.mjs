import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runInventoryPolicyTests({psql,interactive}){
 let assertions=0,races=0;
 const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 const service=sql=>'SET ROLE service_role;'+sql;
 const json=sql=>JSON.parse(query(service(sql)));
 const check=(v,expected)=>{assert.deepEqual(v,expected);assertions++;};
 const reject=(sql,pattern)=>{let failure;try{query(sql);}catch(e){failure=e;}assert.ok(failure);assert.ok(String(failure.stderr??failure.message).includes(pattern),String(failure.stderr??failure.message));assertions++;};
 const admin=randomUUID(),other=randomUUID(),customer=randomUUID(),product=randomUUID(),variant=randomUUID();
 query(`INSERT INTO auth.users(id) VALUES('${admin}'),('${other}'),('${customer}');INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin'),('${other}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Policy fixture','policy-${product}',10000,true);INSERT INTO public.product_variants(id,product_id,size,stock_quantity) VALUES('${variant}','${product}','M',5)`);
 const read=(actor=admin)=>`SELECT public.trusted_inventory_policy('${actor}','${product}','${variant}')`;
 const set=(key,revision,threshold,reason='reorder policy',actor=admin)=>`SELECT public.trusted_inventory_policy_set('${actor}','${key}','${product}','${variant}',${revision},${threshold===null?'NULL':threshold},${quote(reason)})`;
 const current=()=>json(read()),revision=()=>Number(query(`SELECT revision FROM inventory_private.low_stock_policies WHERE variant_id='${variant}'`));
 check(current().revision,0);check(current().threshold,null);check(current().writesEnabled,false);check(current().alert,'unset');
 reject(service(set(randomUUID(),0,5)),'POLICY_DISABLED');
 for(const role of ['anon','authenticated']){
  reject(`SET ROLE ${role};${read()}`,'permission denied');reject(`SET ROLE ${role};${set(randomUUID(),0,5)}`,'permission denied');
  reject(`SET ROLE ${role};SELECT * FROM inventory_private.low_stock_policies`,'permission denied');reject(`SET ROLE ${role};SELECT * FROM inventory_private.policy_changes`,'permission denied');
 }
 reject(service(read(customer)),'INVENTORY_FORBIDDEN');
 query('UPDATE inventory_private.settings SET policies_enabled=true');
 const key=randomUUID(),receipt=json(set(key,0,5));check(receipt.revision,1);check(current().alert,'low');check(current().lastRequestId,key);
 check(json(set(key,0,5)),receipt);check(revision(),1);reject(service(set(key,0,6)),'POLICY_CONFLICT');reject(service(set(randomUUID(),0,6)),'POLICY_STALE');
 for(const value of [-1,100001])reject(service(set(randomUUID(),1,value)),'POLICY_INVALID');
 reject(service(set(randomUUID(),1,6,'x')),'POLICY_INVALID');
 query(`UPDATE public.product_variants SET stock_quantity=6 WHERE id='${variant}'`);check(current().alert,'ok');
 query(`UPDATE public.product_variants SET stock_quantity=0 WHERE id='${variant}'`);check(current().alert,'zero');
 query(`UPDATE public.product_variants SET stock_quantity=-1 WHERE id='${variant}'`);check(current().alert,'invalid');
 query(`UPDATE public.product_variants SET stock_quantity=5 WHERE id='${variant}'`);
 // Two admins race from the same revision; only one update can commit.
 const writer=interactive(),contender=interactive(),app='policy-race-'+randomUUID();const done=contender.done.then(output=>({output}),error=>({error}));
 try{
  writer.child.stdin.write(`BEGIN;SET ROLE service_role;${set(randomUUID(),1,7)};\n\\echo POLICY_FIRST_HELD\n`);await writer.until('POLICY_FIRST_HELD');
  contender.child.stdin.write(`SET application_name='${app}';BEGIN;SET ROLE service_role;${set(randomUUID(),1,9,'other admin',other)};\n`);
  let waiting=false;for(let i=0;i<40;i++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND wait_event_type='Lock'`)==='1'){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}check(waiting,true);
  writer.child.stdin.end('COMMIT;');await writer.done;contender.child.stdin.end('COMMIT;');const result=await done;assert.ok(result.error);assert.ok(String(result.error).includes('POLICY_STALE'));assertions++;races++;
 }finally{writer.child.kill();contender.child.kill();}
 check(revision(),2);check(current().threshold,7);
 // Failure to append audit evidence rolls back the setting itself.
 query("CREATE FUNCTION inventory_private.fixture_policy_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic policy audit failure';END$$;CREATE TRIGGER fixture_policy_failure BEFORE INSERT ON inventory_private.policy_changes FOR EACH ROW EXECUTE FUNCTION inventory_private.fixture_policy_failure()");
 reject(service(set(randomUUID(),2,8)),'synthetic policy audit failure');check(revision(),2);check(current().threshold,7);
 query('DROP TRIGGER fixture_policy_failure ON inventory_private.policy_changes;DROP FUNCTION inventory_private.fixture_policy_failure()');
 const disabled=json(set(randomUUID(),2,null,'disable policy'));check(disabled.revision,3);check(current().alert,'unset');
 for(const sql of ['UPDATE inventory_private.policy_changes SET receipt=receipt','DELETE FROM inventory_private.policy_changes','TRUNCATE inventory_private.policy_changes','UPDATE inventory_private.settings SET policies_enabled=false'])reject(service(sql),'permission denied');
 reject('DELETE FROM inventory_private.policy_changes','append-only');
 query('UPDATE inventory_private.settings SET policies_enabled=false');check(json(set(key,0,5)),receipt);reject(service(set(randomUUID(),3,5)),'POLICY_DISABLED');
 query(`DELETE FROM public.user_roles WHERE user_id='${admin}'`);reject(service(set(key,0,5)),'INVENTORY_FORBIDDEN');
 check(Number(query(`SELECT count(*) FROM inventory_private.policy_changes WHERE request->>'variantId'='${variant}'`)),3);
 console.log('INVENTORY_POLICY_DB_TEST_REPORT '+JSON.stringify({assertions,races,passed:true,productionAccess:false}));
}
