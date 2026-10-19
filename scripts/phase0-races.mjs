// Real PostgreSQL sessions against the runner's fresh loopback-only cluster.
export async function runPhase0Races({ psql, interactive }) {
 const user='10000000-0000-0000-0000-000000000002';
 const product='51000000-0000-0000-0000-000000000001';
 const request=JSON.stringify({addressId:'61000000-0000-0000-0000-000000000002',shippingOption:'tipax',items:[{productId:'41000000-0000-0000-0000-000000000001',quantity:2,size:'M',color:'red'}]});
 const checkout=()=>{
  const key=psql('-c','SELECT gen_random_uuid()').trim();
  const quote=JSON.parse(psql('-c',"SELECT public.trusted_checkout('"+user+"','"+key+"','"+request+"',NULL)").trim());
  return JSON.parse(psql('-c',"SELECT public.trusted_checkout('"+user+"','"+key+"','"+request+"','"+quote.quote+"')").trim()).orderId;
 };
 const stock=()=>Number(psql('-c',"SELECT stock_quantity FROM public.product_variants WHERE id='"+product+"'").trim());
 const before=stock(), order=checkout();
 psql('-c',"UPDATE checkout_private.reservations SET expires_at=now()-interval '1 second' WHERE order_id='"+order+"'");
 const first=interactive();
 try {
  first.child.stdin.write("BEGIN; SET ROLE service_role; SELECT id FROM public.orders WHERE id='"+order+"' FOR UPDATE;\n\\echo EXPIRY_LOCKED\n");
  await first.until('EXPIRY_LOCKED');
  const other=psql('-c',"SELECT public.trusted_expire_unstarted('"+user+"',50)").trim();
  if(other!=='0')throw Error('Second expiry did not skip locked order');
  first.child.stdin.end("SELECT public.trusted_expire_unstarted('"+user+"',50); COMMIT;");
  await first.done;
  if(stock()!==before)throw Error('Concurrent expiry changed stock more than once');
 } finally { first.child.kill(); }
 console.log('PASS: concurrent expiry restores stock once and skips a locked order.');
 const raced=checkout(); psql('-c',"UPDATE checkout_private.reservations SET expires_at=now()-interval '1 second' WHERE order_id='"+raced+"'");
 const expirer=interactive(), claimant=interactive();
 const claimed=claimant.done.then(output=>({output}),error=>({error}));
 try {
  expirer.child.stdin.write("BEGIN; SET ROLE service_role; SELECT id FROM public.orders WHERE id='"+raced+"' FOR UPDATE;\n\\echo EXPIRY_OWNS_PARENT\n");
  await expirer.until('EXPIRY_OWNS_PARENT');
  claimant.child.stdin.end("SET ROLE service_role; SELECT public.trusted_payment_claim('"+raced+"','"+user+"','phase0');");
  expirer.child.stdin.end("SELECT public.trusted_expire_unstarted('"+user+"',50); COMMIT;");
  await expirer.done; const result=await claimed;
  if(!result.error||!String(result.error).includes('Order not payable'))throw Error('Expired order could claim a payment');
  if(stock()!==before)throw Error('Claim/expiry race damaged stock');
 } finally { expirer.child.kill();claimant.child.kill(); }
 console.log('PASS: expiry versus initiation cannot sell restored stock through an expired order.');
 const held=psql('-c',"SELECT order_id FROM checkout_private.attempts WHERE state='creating' AND merchant='phase0' LIMIT 1").trim();
 const attempt=JSON.parse(psql('-c',"SELECT public.trusted_payment_claim('"+held+"','"+user+"','phase0')").trim());
 psql('-c',"SELECT public.trusted_payment_attach('"+attempt.id+"','89077')");
 const verifier=interactive(), duplicate=interactive();
 try {
  verifier.child.stdin.write("BEGIN; SET ROLE service_role; SELECT public.trusted_verification_claim('"+attempt.id+"','99077','"+user+"');\n\\echo VERIFICATION_CLAIMED\n");
  await verifier.until('VERIFICATION_CLAIMED');
  duplicate.child.stdin.end("SET ROLE service_role; SELECT public.trusted_verification_claim('"+attempt.id+"','99077','"+user+"');");
  verifier.child.stdin.end('COMMIT;'); await verifier.done;
  const output=await duplicate.done;
  if(!output.includes('"claimed": false'))throw Error('Duplicate callback acquired another verification claim');
 } finally { verifier.child.kill();duplicate.child.kill(); }
 console.log('PASS: concurrent verification callbacks acquire one durable provider-call claim.');
}
