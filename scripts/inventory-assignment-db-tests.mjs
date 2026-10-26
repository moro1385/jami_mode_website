import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assignmentRead,assignmentReceipt,assignmentHistory,assigneePage} from '../server/inventory-assignment-contract.js';
export async function runInventoryAssignmentTests({psql,interactive}){
 let assertions=0,races=0;const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1),service=sql=>'SET ROLE service_role;'+sql,json=sql=>JSON.parse(query(service(sql)));
 const check=(a,b)=>{assert.deepEqual(a,b);assertions++;},reject=(sql,code)=>{let e;try{query(sql);}catch(f){e=f;}assert.ok(e);assert.ok(String(e.stderr??e.message).includes(code),String(e.stderr??e.message));assertions++;};
 const admin=randomUUID(),other=randomUUID(),customer=randomUUID(),product=randomUUID(),variant=randomUUID();
 query(`INSERT INTO auth.users(id) VALUES('${admin}'),('${other}'),('${customer}');INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin'),('${other}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Assignment fixture','assignment-${product}',10000,true);INSERT INTO public.product_variants(id,product_id,size,stock_quantity) VALUES('${variant}','${product}','M',5);UPDATE inventory_private.settings SET policies_enabled=true`);
 json(`SELECT public.trusted_inventory_policy_set('${admin}','${randomUUID()}','${product}','${variant}',0,10,'assignment fixture policy')`);
 const read=(who=admin)=>`SELECT public.trusted_inventory_assignment('${who}','${product}','${variant}')`,current=()=>json(read());
 const set=(c,key=randomUUID(),assignee=other,who=admin,reason='assign stock followup')=>`SELECT public.trusted_inventory_assignment_set('${who}','${key}','${product}','${variant}','${c.context.inventoryRevision}',${c.context.policyRevision},${c.revision},${assignee===null?'NULL':quote(assignee)},${quote(reason)})`;
 const history=(cursor=null)=>json(`SELECT public.trusted_inventory_assignment_history('${admin}','${product}','${variant}',${cursor?quote(cursor.createdAt):'NULL'},${cursor?quote(cursor.id):'NULL'},20)`);
 check(current().revision,0);check(current().assigneeId,null);check(current().assigneeActive,false);check(current().canWrite,false);reject(service(set(current())),'ASSIGNMENT_DISABLED');
 for(const role of ['anon','authenticated']){
  reject(`SET ROLE ${role};${read()}`,'permission denied');reject(`SET ROLE ${role};${set(current())}`,'permission denied');reject(`SET ROLE ${role};SELECT public.trusted_inventory_assignees('${admin}')`,'permission denied');reject(`SET ROLE ${role};SELECT public.trusted_inventory_assignment_history('${admin}','${product}','${variant}')`,'permission denied');
  for(const t of ['alert_assignments','assignment_events'])reject(`SET ROLE ${role};SELECT * FROM inventory_private.${t}`,'permission denied');
 }
 reject(service(read(customer)),'INVENTORY_FORBIDDEN');query('UPDATE inventory_private.settings SET assignments_enabled=true');
 const initial=current(),key=randomUUID(),receipt=json(set(initial,key));check(current().assigneeId,other);check(current().assigneeActive,true);check(current().revision,1);check(json(set(initial,key)),receipt);check(history().entries.length,1);
 check(assignmentRead(current(),product,variant).assigneeId,other);
 check(assignmentReceipt(receipt,admin,{productId:product,variantId:variant,inventoryRevision:initial.context.inventoryRevision,policyRevision:initial.context.policyRevision,expectedRevision:0,assigneeId:other,reason:'assign stock followup',idempotencyKey:key}),receipt);
 check(assignmentHistory(history(),{productId:product,variantId:variant}).entries.length,1);
 reject(service(set(initial,key,admin)),'ASSIGNMENT_CONFLICT');reject(service(set(initial,randomUUID(),admin)),'ASSIGNMENT_STALE_REVISION');reject(service(set(current(),randomUUID(),customer)),'ASSIGNMENT_TARGET_INACTIVE');reject(service(set(current())),'ASSIGNMENT_UNCHANGED');
 const stale=current();query(`UPDATE public.product_variants SET stock_quantity=6 WHERE id='${variant}'`);check(current().assigneeId,other);check(current().revision,1);reject(service(set(stale,randomUUID(),admin)),'ASSIGNMENT_STALE_CONTEXT');
 const followupBefore=query(`SELECT public.trusted_inventory_followup('${admin}','${product}','${variant}')`),stockBefore=query(`SELECT stock_quantity FROM public.product_variants WHERE id='${variant}'`);
 const transferred=json(set(current(),randomUUID(),admin));check(transferred.beforeAssigneeId,other);check(current().assigneeId,admin);const cleared=json(set(current(),randomUUID(),null));check(cleared.beforeAssigneeId,admin);check(current().assigneeId,null);
 check(query(`SELECT public.trusted_inventory_followup('${admin}','${product}','${variant}')`),followupBefore);check(query(`SELECT stock_quantity FROM public.product_variants WHERE id='${variant}'`),stockBefore);
 const c=current(),writer=interactive(),contender=interactive(),app='assignment-race-'+randomUUID(),done=contender.done.then(output=>({output}),error=>({error}));
 try{writer.child.stdin.write(`BEGIN;SET ROLE service_role;${set(c)};\n\\echo ASSIGNMENT_HELD\n`);await writer.until('ASSIGNMENT_HELD');contender.child.stdin.write(`SET application_name='${app}';BEGIN;SET ROLE service_role;${set(c,randomUUID(),admin,other)};\n`);let waiting=false;for(let n=0;n<40;n++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND wait_event_type='Lock'`)==='1'){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}check(waiting,true);writer.child.stdin.end('COMMIT;');await writer.done;contender.child.stdin.end('COMMIT;');const result=await done;assert.ok(result.error);assert.ok(String(result.error).includes('ASSIGNMENT_STALE_REVISION'));assertions++;races++;}finally{writer.child.kill();contender.child.kill();}
 const before=current();query("CREATE FUNCTION inventory_private.fixture_assignment_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic assignment audit failure';END$$;CREATE TRIGGER fixture_assignment_failure BEFORE INSERT ON inventory_private.assignment_events FOR EACH ROW EXECUTE FUNCTION inventory_private.fixture_assignment_failure()");
 reject(service(set(before,randomUUID(),admin)),'synthetic assignment audit failure');check(current(),before);query('DROP TRIGGER fixture_assignment_failure ON inventory_private.assignment_events;DROP FUNCTION inventory_private.fixture_assignment_failure()');
 for(let n=0;n<23;n++)json(set(current(),randomUUID(),n%2?other:admin));
 const first=history(),second=history(first.entries.at(-1));check(first.entries.length,20);check(first.hasMore,true);check(second.hasMore,false);check(new Set([...first.entries,...second.entries].map(e=>e.id)).size,first.entries.length+second.entries.length);
 if(current().assigneeId!==other)json(set(current()));query(`DELETE FROM public.user_roles WHERE user_id='${other}' AND role='admin'`);check(current().assigneeId,other);check(current().assigneeActive,false);check(current().assigneeName,null);check(json(set(initial,key)),receipt);reject(service(set(current(),randomUUID(),other)),'ASSIGNMENT_TARGET_INACTIVE');json(set(current(),randomUUID(),null));
 const count=query('SELECT count(*) FROM inventory_private.assignment_events');query('BEGIN READ ONLY;SET ROLE service_role;'+read()+';COMMIT');check(query('SELECT count(*) FROM inventory_private.assignment_events'),count);
 for(const sql of ['UPDATE inventory_private.assignment_events SET receipt=receipt','DELETE FROM inventory_private.assignment_events','TRUNCATE inventory_private.assignment_events'])reject(service(sql),'permission denied');reject('DELETE FROM inventory_private.assignment_events','append-only');
 // A bounded roster across more than one page; no phone/email is returned.
 const ids=Array.from({length:55},()=>randomUUID());query(`INSERT INTO auth.users(id) VALUES ${ids.map(id=>`('${id}')`).join(',')};INSERT INTO public.user_roles(user_id,role) VALUES ${ids.map(id=>`('${id}','admin')`).join(',')}`);
 let after=null,rows=[];for(let n=0;n<10;n++){const page=json(`SELECT public.trusted_inventory_assignees('${admin}',${after?quote(after):'NULL'},50)`);check(page.rows.length<=50,true);rows.push(...page.rows);if(!page.hasMore)break;after=page.rows.at(-1).id;}
 check(assigneePage(json(`SELECT public.trusted_inventory_assignees('${admin}',NULL,50)`),null).rows.length,50);
 check(ids.every(id=>rows.some(r=>r.id===id)),true);check(new Set(rows.map(r=>r.id)).size,rows.length);check(rows.every(r=>Object.keys(r).sort().join(',')==='id,name'),true);check(rows.some(r=>r.id===customer||r.id===other),false);
 query('UPDATE inventory_private.settings SET assignments_enabled=false');check(json(set(initial,key)),receipt);reject(service(set(current(),randomUUID(),admin)),'ASSIGNMENT_DISABLED');
 query(`DELETE FROM public.user_roles WHERE user_id='${admin}'`);reject(service(set(initial,key)),'INVENTORY_FORBIDDEN');
 query(`INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');DELETE FROM public.product_variants WHERE id='${variant}'`);check(current().context.alert,'missing');check(current().canWrite,false);check(history().entries.length,20);
 console.log('INVENTORY_ASSIGNMENT_DB_TEST_REPORT '+JSON.stringify({assertions,races,passed:true,productionAccess:false}));
}
