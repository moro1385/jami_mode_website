import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runWalletLedgerRaces({psql,interactive}){
 const user=randomUUID(),product=randomUUID(),address=randomUUID();
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 query(`INSERT INTO auth.users(id) VALUES('${user}');INSERT INTO public.products(id,name,slug,price,is_active,is_out_of_stock,sizes,colors) VALUES('${product}','Wallet race fixture','wallet-${product}',20000,true,false,'{}','{}');INSERT INTO public.addresses(id,user_id,line1) VALUES('${address}','${user}','Synthetic');`);
 // Historical observation is created explicitly in this disposable fixture only.
 query(`INSERT INTO checkout_private.wallet_accounts(user_id,opening_balance,balance) VALUES('${user}',30000,30000);UPDATE public.profiles SET wallet_balance=30000 WHERE id='${user}';SELECT public.trusted_wallet_review_opening('${user}',30000,repeat('c',64),'race-case','fixture');UPDATE checkout_private.wallet_control SET spending_enabled=true;`);
 const makeOrder=()=>{
  const key=randomUUID(),selection=JSON.stringify({addressId:address,shippingOption:'tipax',items:[{productId:product,quantity:1}]});
  return JSON.parse(query(`SELECT public.trusted_checkout('${user}','${key}','${selection}',(public.trusted_checkout('${user}','${key}','${selection}',NULL)->>'quote'))`)).orderId;
 };
 const a=makeOrder(),b=makeOrder(),first=interactive(),second=interactive();
 try{
  first.child.stdin.write(`BEGIN;SET ROLE service_role;SELECT public.trusted_wallet_pay('${a}','${user}','${randomUUID()}');\n\\echo WALLET_FIRST_HELD\n`);await first.until('WALLET_FIRST_HELD');
  second.child.stdin.write(`SET application_name='wallet-race-${user}';BEGIN;SET ROLE service_role;\n\\echo WALLET_SECOND_STARTED\nDO $$ BEGIN PERFORM public.trusted_wallet_pay('${b}','${user}','${randomUUID()}');RAISE EXCEPTION 'Unexpected second success';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Insufficient wallet funds' THEN RAISE;END IF;END $$;\n`);await second.until('WALLET_SECOND_STARTED');
  let blocked=false;for(let i=0;i<25;i++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='wallet-race-${user}' AND wait_event_type='Lock'`)==='1'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(blocked,true,'Second purchase must wait on the wallet owner lock');
  first.child.stdin.end('COMMIT;');await first.done;second.child.stdin.end('COMMIT;');await second.done;
  const result=JSON.parse(query(`SELECT jsonb_build_object('balance',(SELECT wallet_balance FROM public.profiles WHERE id='${user}'),'entries',(SELECT count(*) FROM checkout_private.wallet_entries WHERE user_id='${user}'),'paid',(SELECT count(*) FROM public.orders WHERE user_id='${user}' AND payment_state='paid'),'consistent',(public.trusted_wallet_reconcile('${user}')->>'consistent')::boolean)`));assert.deepEqual(result,{balance:10000,entries:1,paid:1,consistent:true});
  console.log('PASS: competing real sessions cannot overspend one wallet; second session waits and sees committed balance.');
 }finally{first.child.kill();second.child.kill();}
 // A gateway claim holds the same order lock. Wallet must reject after it commits.
 const gateway=interactive(),wallet=interactive();
 try{
  gateway.child.stdin.write(`BEGIN;SET ROLE service_role;SELECT public.trusted_payment_claim('${b}','${user}','race-only');\n\\echo GATEWAY_CLAIM_HELD\n`);await gateway.until('GATEWAY_CLAIM_HELD');
  wallet.child.stdin.write(`SET application_name='wallet-gateway-${user}';BEGIN;SET ROLE service_role;\n\\echo WALLET_CLAIM_STARTED\nDO $$ BEGIN PERFORM public.trusted_wallet_pay('${b}','${user}','${randomUUID()}');RAISE EXCEPTION 'Unexpected wallet switch';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Order not wallet payable' THEN RAISE;END IF;END $$;\n`);await wallet.until('WALLET_CLAIM_STARTED');
  let blocked=false;for(let i=0;i<25;i++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='wallet-gateway-${user}' AND wait_event_type='Lock'`)==='1'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(blocked,true);
  gateway.child.stdin.end('COMMIT;');await gateway.done;wallet.child.stdin.end('COMMIT;');await wallet.done;
  assert.equal(query(`SELECT count(*) FROM checkout_private.wallet_entries WHERE order_id='${b}'`),'0');
  console.log('PASS: concurrent gateway claim prevents wallet debit of the same order.');
 }finally{gateway.child.kill();wallet.child.kill();}
 // Credit and purchase share the profile lock; neither may overwrite the other.
 const c=makeOrder(),topup=randomUUID(),credit=interactive(),debit=interactive();
 query(`INSERT INTO public.wallet_topups(id,user_id,amount,payment_ref) VALUES('${topup}','${user}',50000,'820001');SELECT public.trusted_payment_lookup('${topup}',true,'820001','race-only');`);
 try{
  credit.child.stdin.write(`BEGIN;SET ROLE service_role;SELECT public.trusted_payment_settle((SELECT id FROM checkout_private.attempts WHERE topup_id='${topup}'),50000,'race-only','820001','98820001');\n\\echo CREDIT_HELD\n`);await credit.until('CREDIT_HELD');
  debit.child.stdin.write(`SET application_name='wallet-credit-${user}';BEGIN;SET ROLE service_role;\n\\echo DEBIT_STARTED\nSELECT public.trusted_wallet_pay('${c}','${user}','${randomUUID()}');\n`);await debit.until('DEBIT_STARTED');
  let blocked=false;for(let i=0;i<25;i++){if(query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='wallet-credit-${user}' AND wait_event_type='Lock'`)==='1'){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(blocked,true);
  credit.child.stdin.end('COMMIT;');await credit.done;debit.child.stdin.end('COMMIT;');await debit.done;
  const result=JSON.parse(query(`SELECT jsonb_build_object('balance',(SELECT wallet_balance FROM public.profiles WHERE id='${user}'),'entries',(SELECT count(*) FROM checkout_private.wallet_entries WHERE user_id='${user}'),'consistent',(public.trusted_wallet_reconcile('${user}')->>'consistent')::boolean)`));assert.deepEqual(result,{balance:40000,entries:3,consistent:true});
  console.log('PASS: concurrent verified credit and purchase retain both deltas without a lost balance update.');
 }finally{credit.child.kill();debit.child.kill();}
 query('UPDATE checkout_private.wallet_control SET spending_enabled=false');
}
