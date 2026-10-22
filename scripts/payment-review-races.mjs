import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runPaymentReviewRaces({psql,interactive}){
 const user=randomUUID(),product=randomUUID(),address=randomUUID(),key=randomUUID();
 const raw=psql('-c',`INSERT INTO auth.users(id) VALUES('${user}');
 INSERT INTO public.products(id,name,slug,price,is_active,is_out_of_stock,sizes,colors) VALUES('${product}','Review race fixture','review-${product}',20000,true,false,'{}','{}');
 INSERT INTO public.addresses(id,user_id,line1) VALUES('${address}','${user}','Synthetic');
 DO $$ DECLARE q jsonb;r jsonb;a jsonb;sel jsonb;BEGIN
 sel:='{"addressId":"${address}","shippingOption":"tipax","items":[{"productId":"${product}","quantity":1}]}'::jsonb;
 q:=public.trusted_checkout('${user}','${key}',sel,NULL);
 r:=public.trusted_checkout('${user}','${key}',sel,q->>'quote');
 a:=public.trusted_payment_claim((r->>'orderId')::uuid,'${user}','review-race-only');
 PERFORM public.trusted_payment_attach((a->>'id')::uuid,'720001');END $$;
 SELECT jsonb_build_object('id',a.id,'order',a.order_id) FROM checkout_private.attempts a JOIN public.orders o ON o.id=a.order_id WHERE o.user_id='${user}';`);
 const fixture=JSON.parse(raw.trim().split(/\r?\n/).at(-1));
 const invoke=`SELECT public.trusted_review_payment('${fixture.id}',20000,'review-race-only','720001','98720001',repeat('b',64),'provider_support','ticket-race','fixture-reviewer',transaction_timestamp(),true);`;
 // Both requests use exactly the same reviewed timestamp, even across sessions.
 const at=psql('-c','SELECT clock_timestamp()').trim().split(/\r?\n/).at(-1);
 const query=invoke.replace('transaction_timestamp()',`'${at}'::timestamptz`);
 const first=interactive(),second=interactive();
 try{
  first.child.stdin.write(`BEGIN; SET ROLE service_role; ${query}\n\\echo REVIEW_ONE_HELD\n`);
  await first.until('REVIEW_ONE_HELD');
  second.child.stdin.write(`SET application_name='review-race-${user}'; BEGIN; SET ROLE service_role;\n\\echo REVIEW_TWO_STARTED\n${query}\n`);
  await second.until('REVIEW_TWO_STARTED');
  let blocked=false;
  for(let i=0;i<25;i++){
   const state=psql('-c',`SELECT count(*) FROM pg_stat_activity WHERE application_name='review-race-${user}' AND wait_event_type='Lock'`).trim().split(/\r?\n/).at(-1);
   if(state==='1'){blocked=true;break;}
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(blocked,true,'Second real PostgreSQL session must wait on the first review transaction');
  first.child.stdin.end('COMMIT;');const a=await first.done;
  second.child.stdin.end('COMMIT;');const b=await second.done;
  assert.ok(a.includes('"applied": true'));assert.ok(b.includes('already_settled'));
  const summary=JSON.parse(psql('-c',`SELECT jsonb_build_object(
   'reviews',(select count(*) from checkout_private.payment_reviews where attempt_id='${fixture.id}'),
   'evidence',(select count(*) from checkout_private.verifications where attempt_id='${fixture.id}' and state='verified'),
   'events',(select count(*) from checkout_private.outbox where attempt_id='${fixture.id}'),
   'paid',(select payment_state='paid' from public.orders where id='${fixture.order}'))`).trim().split(/\r?\n/).at(-1));
  assert.deepEqual(summary,{reviews:1,evidence:1,events:1,paid:true});
  console.log('PASS: two blocked/concurrent operator reviews commit one decision, evidence and settlement event.');
 }finally{first.child.kill();second.child.kill();}
}
