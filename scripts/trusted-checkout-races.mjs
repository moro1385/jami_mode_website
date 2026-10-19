// Separate psql processes, actual PostgreSQL locks; no mocked concurrency.
export async function runRaces({ psql, interactive }) {
  const user = '10000000-0000-0000-0000-000000000001';
  const order = '20000000-0000-0000-0000-000000000098';
  psql('-c', `INSERT INTO public.orders(id,user_id,status,payment_method,total_amount)
    VALUES('${order}','${user}','pending_payment','gateway',10000);
    CREATE FUNCTION public.fixture_announce_item() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE NOTICE 'ITEM_STARTED'; RETURN NEW; END $$;
    CREATE TRIGGER aaa_fixture_announce_item BEFORE INSERT ON public.order_items
      FOR EACH ROW EXECUTE FUNCTION public.fixture_announce_item();`);
  const locker = interactive();
  const inserter = interactive();
  // Attach rejection handler immediately: the expected error must not become
  // an unhandled promise rejection while the parent lock is held.
  const inserted = inserter.done.then(output => ({ output }), error => ({ error }));
  try {
    locker.child.stdin.write(`BEGIN; UPDATE public.orders SET items_frozen=true WHERE id='${order}';\n\\echo LOCKED\n`);
    await locker.until('LOCKED');
    inserter.child.stdin.end(`SET ROLE service_role; INSERT INTO public.order_items(order_id,price,quantity) VALUES('${order}',1,1);`);
    await inserter.until('ITEM_STARTED');
    locker.child.stdin.end('COMMIT;');
    await locker.done;
    const result = await inserted;
    if (!result.error || !String(result.error).includes('Order items frozen')) throw new Error('Concurrent INSERT escaped freeze');
    psql('-c', `SELECT public.test_assert((SELECT count(*)=0 FROM public.order_items WHERE order_id='${order}'),'concurrent item insertion blocked by parent lock'); DROP TRIGGER aaa_fixture_announce_item ON public.order_items;`);
    console.log('PASS: concurrent item INSERT observes committed parent freeze.');
  } finally {
    locker.child.stdin.end(); inserter.child.stdin.end();
    await Promise.allSettled([locker.done,inserter.done]);
  }

  // A pair of callbacks waits on the same durable attempt row, then settles.
  const topup = '30000000-0000-0000-0000-000000000098';
  psql('-c', `INSERT INTO public.wallet_topups(id,user_id,amount,payment_ref) VALUES('${topup}','${user}',1000,'race-wallet-ref');`);
  const attempt = JSON.parse(psql('-c', `SET ROLE service_role; SELECT public.trusted_payment_lookup('${topup}',true,'race-wallet-ref','fixture-merchant');`).trim().split(/\r?\n/).at(-1));
  const gate = interactive(); const first = interactive(); const second = interactive();
  try {
    gate.child.stdin.write(`BEGIN; SELECT id FROM checkout_private.attempts WHERE id='${attempt.id}' FOR UPDATE;\n\\echo LOCKED\n`);
    await gate.until('LOCKED');
    const settlement = `SET ROLE service_role;\n\\echo CALLBACK_STARTED\nSELECT public.trusted_payment_settle('${attempt.id}',1000,'fixture-merchant','race-wallet-ref','race-wallet-trans');`;
    first.child.stdin.end(settlement); second.child.stdin.end(settlement);
    await Promise.all([first.until('CALLBACK_STARTED'),second.until('CALLBACK_STARTED')]);
    gate.child.stdin.end('COMMIT;');
    await Promise.all([gate.done,first.done,second.done]);
    psql('-c', `SELECT public.test_assert((SELECT wallet_balance=7000 FROM public.profiles WHERE id='${user}'),'concurrent callbacks credit exactly once');
      SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.wallet_credits WHERE topup_id='${topup}'),'one durable ledger entry');
      SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.outbox WHERE attempt_id='${attempt.id}'),'one durable outbox event');`);
    console.log('PASS: concurrent callbacks produce one wallet credit and outbox event.');
  } finally {
    gate.child.stdin.end(); first.child.stdin.end(); second.child.stdin.end();
    await Promise.allSettled([gate.done,first.done,second.done]);
  }

  const request = JSON.stringify({ addressId:'60000000-0000-0000-0000-000000000001', shippingOption:'tipax',
    items:[{productId:'40000000-0000-0000-0000-000000000002',quantity:1,size:'M',color:'red'}] });
  const checkout = (key,quote='NULL') => `SELECT public.trusted_checkout('${user}','${key}','${request}'::jsonb,${quote});`;
  const key1='70000000-0000-0000-0000-000000000098', key2='70000000-0000-0000-0000-000000000099';
  const quote = JSON.parse(psql('-c',`SET ROLE service_role; ${checkout(key1)}`).trim().split(/\r?\n/).at(-1));
  psql('-c',"UPDATE public.product_variants SET stock_quantity=1 WHERE id='50000000-0000-0000-0000-000000000001';");
  const buyer1=interactive(), buyer2=interactive(), stockGate=interactive();
  const outcome1=buyer1.done.then(output=>({output}),error=>({error}));
  const outcome2=buyer2.done.then(output=>({output}),error=>({error}));
  try {
    stockGate.child.stdin.write("BEGIN; SELECT id FROM public.products WHERE id='40000000-0000-0000-0000-000000000002' FOR UPDATE;\n\\echo LOCKED\n");
    await stockGate.until('LOCKED');
    buyer1.child.stdin.end(`SET ROLE service_role;\n\\echo BUYER_STARTED\n${checkout(key1,`'${quote.quote}'`)}`);
    buyer2.child.stdin.end(`SET ROLE service_role;\n\\echo BUYER_STARTED\n${checkout(key2,`'${quote.quote}'`)}`);
    await Promise.all([buyer1.until('BUYER_STARTED'),buyer2.until('BUYER_STARTED')]);
    stockGate.child.stdin.end('COMMIT;'); await stockGate.done;
    const outcomes=await Promise.all([outcome1,outcome2]);
    if (outcomes.filter(result=>result.error).length!==1 || !outcomes.some(result=>String(result.error).includes('Insufficient stock'))) throw new Error('Last-unit race did not reject exactly one buyer');
    psql('-c',`SELECT public.test_assert((SELECT stock_quantity=0 FROM public.product_variants WHERE id='50000000-0000-0000-0000-000000000001'),'last unit allocated once');
      SELECT public.test_assert((SELECT count(*)=1 FROM checkout_private.requests WHERE key IN ('${key1}','${key2}')),'losing checkout rolled back');`);
    console.log('PASS: two concurrent buyers allocate the last variant once; losing transaction rolls back.');
  } finally {
    stockGate.child.stdin.end(); buyer1.child.stdin.end(); buyer2.child.stdin.end();
    await Promise.allSettled([stockGate.done,buyer1.done,buyer2.done]);
  }
  // Concurrent initiation: one claim returns claimed=true, one returns false.
  const payable=JSON.parse(psql('-c',`SELECT to_jsonb(r) FROM checkout_private.requests r WHERE key IN ('${key1}','${key2}');`).trim());
  const init1=interactive(),init2=interactive();
  const claim=`SET ROLE service_role; SELECT public.trusted_payment_claim('${payable.order_id}','${user}','fixture-merchant');`;
  init1.child.stdin.end(claim); init2.child.stdin.end(claim);
  const claimed=await Promise.all([init1.done,init2.done]);
  if (claimed.filter(output=>output.includes('"claimed": true')).length!==1 || claimed.filter(output=>output.includes('"claimed": false')).length!==1) throw new Error('Duplicate initiation claim');
  console.log('PASS: concurrent initiation claims one provider creation.');
}
