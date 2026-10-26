import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runInventoryFollowupQueueTests({psql}){
 let assertions=0;
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1),json=sql=>JSON.parse(query('SET ROLE service_role;'+sql));
 const check=(a,b)=>{assert.deepEqual(a,b);assertions++;};
 const reject=(sql,code)=>{let e;try{query(sql);}catch(failure){e=failure;}assert.ok(e);assert.ok(String(e.stderr??e.message).includes(code));assertions++;};
 const actor=randomUUID(),customer=randomUUID(),product='ffffffff-ffff-4fff-8fff-fffffffffff1',floor={productId:'ffffffff-ffff-4fff-8fff-fffffffffff0',variantId:'00000000-0000-0000-0000-000000000000'};
 const id=n=>'a9000000-0000-4000-8000-'+String(n).padStart(12,'0');
 query(`INSERT INTO auth.users(id) VALUES('${actor}'),('${customer}');INSERT INTO public.user_roles(user_id,role) VALUES('${actor}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Followup queue fixture','followup-queue-${product}',10000,true);UPDATE inventory_private.settings SET followups_enabled=true`);
 query(`INSERT INTO public.product_variants(id,product_id,size,stock_quantity) VALUES ${Array.from({length:66},(_,n)=>`('${id(n+1)}','${product}','M',2)`).join(',')};INSERT INTO inventory_private.low_stock_policies(product_id,variant_id,threshold,revision,updated_by,request_id,updated_at) VALUES ${Array.from({length:66},(_,n)=>`('${product}','${id(n+1)}',5,1,'${actor}',gen_random_uuid(),now())`).join(',')}`);
 for(let n=1;n<=16;n++){
  const token=query(`SELECT inventory_revision FROM public.product_variants WHERE id='${id(n)}'`),status=n<=5?'reviewed':n<=10?'in_progress':'open';
  json(`SELECT public.trusted_inventory_followup_set('${actor}','${randomUUID()}','${product}','${id(n)}','${token}',1,0,'${status}','queue fixture review')`);
 }
 // Quantity ABA and a same-threshold policy revision invalidate earlier reviews.
 query(`UPDATE public.product_variants SET stock_quantity=3 WHERE id='${id(1)}';UPDATE public.product_variants SET stock_quantity=2 WHERE id='${id(1)}';UPDATE inventory_private.low_stock_policies SET revision=2 WHERE product_id='${product}' AND variant_id='${id(6)}'`);
 const token=query(`SELECT inventory_revision FROM public.product_variants WHERE id='${id(66)}'`);json(`SELECT public.trusted_inventory_followup_set('${actor}','${randomUUID()}','${product}','${id(66)}','${token}',1,0,'reviewed','missing fixture review')`);
 query(`DELETE FROM public.product_variants WHERE id='${id(66)}'`);
 const call=(followup='all',cursor=floor,filter='all',limit=50,who=actor)=>`SELECT public.trusted_inventory_alerts_followup('${who}','${filter}','${followup}',${cursor?`'${cursor.productId}','${cursor.variantId}'`:'NULL,NULL'},${limit})`;
 const first=json(call()),last=first.rows.at(-1),second=json(call('all',{productId:last.productId,variantId:last.variantId})),all=[...first.rows,...second.rows];
 check(first.rows.length,50);check(first.hasMore,true);check(second.rows.length,16);check(second.hasMore,false);check(new Set(all.map(r=>r.variantId)).size,66);check(all.every(r=>r.productId===product),true);
 check(all.filter(r=>r.followupStatus==='reviewed').length,4);check(all.filter(r=>r.followupStatus==='in_progress').length,4);check(all.filter(r=>r.followupStatus==='open').length,58);check(all.filter(r=>r.contextChanged).length,3);
 check(all.find(r=>r.variantId===id(1)).followupStatus,'open');check(all.find(r=>r.variantId===id(6)).contextChanged,true);check(all.find(r=>r.variantId===id(66)).alert,'missing');check(all.find(r=>r.variantId===id(60)).followupRevision,0);
 for(const [status,count] of [['reviewed',4],['in_progress',4],['needs_review',3]]){const page=json(call(status));check(page.rows.length,count);check(page.hasMore,false);check(page.rows.every(r=>status==='needs_review'?r.contextChanged:r.followupStatus===status),true);}
 const open1=json(call('open')),openLast=open1.rows.at(-1),open2=json(call('open',{productId:openLast.productId,variantId:openLast.variantId}));check(open1.rows.length,50);check(open2.rows.length,8);check(open2.hasMore,false);
 check(json(call('needs_review',floor,'missing')).rows.length,1);check(json(call('reviewed',floor,'missing')).rows.length,0);check(json(call('needs_review',floor,'low')).rows.length,2);
 const countBefore=query('SELECT count(*) FROM inventory_private.alert_followup_events'),stockBefore=query(`SELECT sum(stock_quantity) FROM public.product_variants WHERE product_id='${product}'`);
 assert.doesNotThrow(()=>query('BEGIN READ ONLY;SET ROLE service_role;'+call('needs_review')+';COMMIT'));assertions++;
 check(query('SELECT count(*) FROM inventory_private.alert_followup_events'),countBefore);check(query(`SELECT sum(stock_quantity) FROM public.product_variants WHERE product_id='${product}'`),stockBefore);
 query('UPDATE inventory_private.settings SET followups_enabled=false');check(json(call('reviewed')).rows.length,4);
 for(const role of ['anon','authenticated'])reject(`SET ROLE ${role};${call()}`,'permission denied');
 reject('SET ROLE service_role;'+call('all',floor,'all',50,customer),'INVENTORY_FORBIDDEN');reject('SET ROLE service_role;'+call('bad'),'ALERT_INVALID');reject('SET ROLE service_role;'+call('all',floor,'all',51),'ALERT_INVALID');
 reject(`SET ROLE service_role;SELECT public.trusted_inventory_alerts_followup('${actor}','all','open','${product}',NULL,50)`,'ALERT_INVALID');
 query(`DELETE FROM public.user_roles WHERE user_id='${actor}'`);reject('SET ROLE service_role;'+call(),'INVENTORY_FORBIDDEN');
 console.log('INVENTORY_FOLLOWUP_QUEUE_DB_TEST_REPORT '+JSON.stringify({assertions,passed:true,productionAccess:false}));
}
