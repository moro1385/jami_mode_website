import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runWalletTopupRaces({psql,interactive}){
 const user=randomUUID(),key=randomUUID();
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 query(`INSERT INTO auth.users(id) VALUES('${user}');UPDATE checkout_private.wallet_control SET topups_enabled=true;`);
 async function race(label,firstSql,secondSql){
  const first=interactive(),second=interactive(),app='topup-'+randomUUID();
  try{
   first.child.stdin.write(`BEGIN;SET ROLE service_role;${firstSql};\n\\echo FIRST_HELD\n`);await first.until('FIRST_HELD');
   second.child.stdin.write(`SET application_name='${app}';BEGIN;SET ROLE service_role;\n\\echo SECOND_STARTED\n${secondSql};\n`);await second.until('SECOND_STARTED');
   let blocked=false;
   for(let i=0;i<25;i++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND wait_event_type='Lock'`)==='1'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
   assert.equal(blocked,true,label+' must wait on the first transaction');
   first.child.stdin.end('COMMIT;');await first.done;second.child.stdin.end('COMMIT;');await second.done;
  }finally{first.child.kill();second.child.kill();}
 }
 const claim=`public.trusted_wallet_topup_claim('${user}','${key}',20000,'topup-race')`;
 await race('duplicate initiation',`SELECT public.test_assert((${claim}->>'claimed')::boolean,'first claim fresh')`,`SELECT public.test_assert(NOT (${claim}->>'claimed')::boolean,'second claim reused')`);
 assert.equal(query(`SELECT count(*) FROM checkout_private.wallet_topup_requests WHERE user_id='${user}'`),'1');
 const attempt=JSON.parse(query(`SELECT ${claim}`));
 query(`SET ROLE service_role;SELECT public.trusted_wallet_topup_attach('${attempt.id}','${user}','952001','topup-race');`);
 const verification=`public.trusted_verification_claim('${attempt.id}','952002','${user}')`;
 await race('duplicate verification',`SELECT public.test_assert((${verification}->>'claimed')::boolean,'first verification fresh')`,`SELECT public.test_assert(NOT (${verification}->>'claimed')::boolean,'second verification reused')`);
 query(`SET ROLE service_role;SELECT public.trusted_verification_record('${attempt.id}',20000,'topup-race','952001','952002');`);
 const settle=`SELECT public.trusted_payment_settle('${attempt.id}',20000,'topup-race','952001','952002')`;
 await race('duplicate verified settlement',settle,settle);
 const result=JSON.parse(query(`SELECT jsonb_build_object('balance',(SELECT wallet_balance FROM public.profiles WHERE id='${user}'),'credits',(SELECT count(*) FROM checkout_private.wallet_credits WHERE user_id='${user}'),'entries',(SELECT count(*) FROM checkout_private.wallet_entries WHERE user_id='${user}'),'outbox',(SELECT count(*) FROM checkout_private.outbox WHERE attempt_id='${attempt.id}'),'consistent',(public.trusted_wallet_reconcile('${user}')->>'consistent')::boolean)`));
 assert.deepEqual(result,{balance:20000,credits:1,entries:1,outbox:1,consistent:true});
 query('UPDATE checkout_private.wallet_control SET topups_enabled=false');
 console.log('PASS: real concurrent topup initiation and verification each claim once; concurrent settlement creates one credit, ledger entry and outbox event.');
}
