import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runInventoryAlertTests({psql}){
 let assertions=0;
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 const json=sql=>JSON.parse(query('SET ROLE service_role;'+sql));
 const check=(v,expected)=>{assert.deepEqual(v,expected);assertions++;};
 const reject=(sql,text)=>{let failure;try{query(sql);}catch(error){failure=error;}assert.ok(failure);assert.ok(String(failure.stderr??failure.message).includes(text));assertions++;};
 const actor=randomUUID(),user=randomUUID(),product=randomUUID(),other=randomUUID(),missing=randomUUID();
 const id=n=>'a6000000-0000-4000-8000-'+String(n).padStart(12,'0');
 query(`INSERT INTO auth.users(id) VALUES('${actor}'),('${user}');INSERT INTO public.user_roles(user_id,role) VALUES('${actor}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Alert fixture','alerts-${product}',10000,true),('${other}','Other alert fixture','alerts-${other}',10000,true)`);
 const variants=Array.from({length:65},(_,i)=>{const n=i+1;return `('${id(n)}','${product}','M','red','alert-${n}',${n===1?0:n===2?-1:n===3?10:n===6?1:2})`;}).join(',');
 query(`INSERT INTO public.product_variants(id,product_id,size,color,sku,stock_quantity) VALUES ${variants}`);
 const policies=Array.from({length:65},(_,i)=>{const n=i+1;return `('${product}','${id(n)}',${n===4?'NULL':n===5?0:n===6?1:5},1,'${actor}',gen_random_uuid(),now())`;}).join(',');
 query(`INSERT INTO inventory_private.low_stock_policies(product_id,variant_id,threshold,revision,updated_by,request_id,updated_at) VALUES ${policies},('${product}','${id(66)}',5,1,'${actor}',gen_random_uuid(),now()),('${missing}','${id(67)}',5,1,'${actor}',gen_random_uuid(),now()),('${other}','${id(1)}',5,1,'${actor}',gen_random_uuid(),now())`);
 const call=(filter='all',cursor=null,limit=50,who=actor)=>`SELECT public.trusted_inventory_alerts('${who}','${filter}',${cursor?"'"+cursor.productId+"'":'NULL'},${cursor?"'"+cursor.variantId+"'":'NULL'},${limit})`;
 const first=json(call());check(first.rows.length,50);check(first.hasMore,true);check(first.version,1);
 const last=first.rows.at(-1),second=json(call('all',{productId:last.productId,variantId:last.variantId}));check(second.rows.length,15);check(second.hasMore,false);
 const all=[...first.rows,...second.rows];check(new Set(all.map(row=>row.productId+row.variantId)).size,65);
 check(all.map(row=>row.productId+row.variantId),all.map(row=>row.productId+row.variantId).sort());
 check(all.filter(row=>row.alert==='low').length,60);check(all.filter(row=>row.alert==='zero').length,1);check(all.filter(row=>row.alert==='invalid').length,1);check(all.filter(row=>row.alert==='missing').length,3);
 check(all.some(row=>row.variantId===id(3)||row.variantId===id(4)||row.variantId===id(5)),false);
 for(const state of ['low','zero','invalid','missing']){const page=json(call(state));check(page.rows.every(row=>row.alert===state),true);}
 check(json(call('zero')).rows[0].quantity,0);check(json(call('invalid')).rows[0].quantity,null);
 check(json(call('missing')).rows.every(row=>row.entityExists===false&&row.quantity===null&&row.saleEnabled===false),true);
 check(all.find(row=>row.variantId===id(6)).threshold,1);
 for(const role of ['anon','authenticated'])reject(`SET ROLE ${role};${call()}`,'permission denied');
 reject('SET ROLE service_role;'+call('all',null,50,user),'INVENTORY_FORBIDDEN');
 reject('SET ROLE service_role;'+call('bad'),'ALERT_INVALID');reject('SET ROLE service_role;'+call('all',null,51),'ALERT_INVALID');
 reject(`SET ROLE service_role;SELECT public.trusted_inventory_alerts('${actor}','all','${product}',NULL,50)`,'ALERT_INVALID');
 const auditCount=query('SELECT count(*) FROM inventory_private.policy_changes'),stock=query(`SELECT sum(stock_quantity) FROM public.product_variants WHERE product_id='${product}'`);
 assert.doesNotThrow(()=>query('BEGIN READ ONLY;SET ROLE service_role;'+call()+';COMMIT'));assertions++;
 check(query('SELECT count(*) FROM inventory_private.policy_changes'),auditCount);check(query(`SELECT sum(stock_quantity) FROM public.product_variants WHERE product_id='${product}'`),stock);
 query(`UPDATE public.products SET is_active=false WHERE id='${product}'`);
 check(json(call()).rows.filter(row=>row.productId===product).every(row=>row.saleEnabled===false),true);
 query(`UPDATE public.product_variants SET stock_quantity=100 WHERE id='${id(1)}'`);check(json(call('zero')).rows.length,0);
 query(`DELETE FROM public.user_roles WHERE user_id='${actor}'`);reject('SET ROLE service_role;'+call(),'INVENTORY_FORBIDDEN');
 console.log('INVENTORY_ALERT_DB_TEST_REPORT '+JSON.stringify({assertions,passed:true,productionAccess:false}));
}
