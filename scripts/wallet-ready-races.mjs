import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runWalletReadyRaces({psql,interactive}){
 const user=randomUUID(),query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 query(`INSERT INTO auth.users(id) VALUES('${user}');UPDATE checkout_private.wallet_control SET topups_enabled=true;`);
 async function race(command,label){const first=interactive(),second=interactive(),app='readiness-'+randomUUID();try{
  first.child.stdin.write(`BEGIN;SET ROLE service_role;${command};\n\\echo FIRST_HELD\n`);await first.until('FIRST_HELD');
  second.child.stdin.write(`SET application_name='${app}';BEGIN;SET ROLE service_role;\n\\echo SECOND_STARTED\n${command};\n`);await second.until('SECOND_STARTED');
  let blocked=false;for(let i=0;i<25;i++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND wait_event_type='Lock'`)==='1'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(blocked,true,label+' must serialize');
  first.child.stdin.end('COMMIT;');await first.done;second.child.stdin.end('COMMIT;');await second.done;
 }finally{first.child.kill();second.child.kill();}}
 await race(`SELECT checkout_private.wallet_prepare_zero('${user}')`,'zero origin issuance');
 assert.equal(query(`SELECT count(*) FROM checkout_private.wallet_zero_origins WHERE user_id='${user}'`),'1');
 const attempt=JSON.parse(query(`SET ROLE service_role;SELECT public.trusted_wallet_topup_claim('${user}','${randomUUID()}',50000,'ready-race')`));
 query(`SET ROLE service_role;SELECT public.trusted_wallet_topup_attach('${attempt.id}','${user}','978001','ready-race')`);
 const at=query('SELECT clock_timestamp()');
 await race(`SELECT public.trusted_review_payment('${attempt.id}',50000,'ready-race','978001','978002',repeat('a',64),'provider_portal','ready-race-case','fixture-reviewer','${at}',true)`,'operator topup review');
 const result=JSON.parse(query(`SELECT jsonb_build_object('balance',(SELECT wallet_balance FROM public.profiles WHERE id='${user}'),'origins',(SELECT count(*) FROM checkout_private.wallet_zero_origins WHERE user_id='${user}'),'reviews',(SELECT count(*) FROM checkout_private.payment_reviews WHERE attempt_id='${attempt.id}'),'entries',(SELECT count(*) FROM checkout_private.wallet_entries WHERE user_id='${user}'),'credits',(SELECT count(*) FROM checkout_private.wallet_credits WHERE user_id='${user}'),'outbox',(SELECT count(*) FROM checkout_private.outbox WHERE attempt_id='${attempt.id}'))`));
 assert.deepEqual(result,{balance:50000,origins:1,reviews:1,entries:1,credits:1,outbox:1});
 query('UPDATE checkout_private.wallet_control SET topups_enabled=false');
 console.log('PASS: real concurrent sessions issue one zero origin and independently review/credit one topup exactly once.');
}
