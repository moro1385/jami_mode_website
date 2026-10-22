\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('61000000-0000-4000-8000-000000000001'),('61000000-0000-4000-8000-000000000002');
DO $$ DECLARE v jsonb; t uuid; a jsonb; i int; first_page jsonb; last_item jsonb; second_page jsonb; BEGIN
 v:=public.trusted_wallet_view('61000000-0000-4000-8000-000000000001');
 IF (v->>'spendingEnabled')::boolean OR v->'entries'<>'[]' OR (v->>'balance')::numeric<>0 OR EXISTS(SELECT 1 FROM checkout_private.wallet_accounts WHERE user_id='61000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'View writes or grants unmanaged funds';END IF;
 FOR i IN 1..25 LOOP
  INSERT INTO public.wallet_topups(user_id,amount,payment_ref) VALUES('61000000-0000-4000-8000-000000000001',5000,(963000+i)::text) RETURNING id INTO t;
  a:=public.trusted_payment_lookup(t,true,(963000+i)::text,'view-fixture');
  PERFORM public.trusted_payment_settle((a->>'id')::uuid,5000,'view-fixture',(963000+i)::text,(964000+i)::text);
 END LOOP;
 INSERT INTO public.wallet_topups(user_id,amount) VALUES('61000000-0000-4000-8000-000000000001',7000),('61000000-0000-4000-8000-000000000002',8000);
 first_page:=public.trusted_wallet_view('61000000-0000-4000-8000-000000000001');
 IF (first_page->>'balance')::numeric<>125000 OR jsonb_array_length(first_page->'entries')<>20 OR NOT (first_page->>'hasMore')::boolean OR (first_page->>'spendingEnabled')::boolean OR jsonb_array_length(first_page->'pendingTopups')<>1 THEN RAISE EXCEPTION 'View balance, paging or opening review incorrect';END IF;
 last_item:=first_page->'entries'->19;
 second_page:=public.trusted_wallet_view('61000000-0000-4000-8000-000000000001',(last_item->>'createdAt')::timestamptz,(last_item->>'id')::uuid);
 IF jsonb_array_length(second_page->'entries')<>5 OR (second_page->>'hasMore')::boolean THEN RAISE EXCEPTION 'Tie timestamp pagination lost entries';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(first_page->'entries') x JOIN jsonb_array_elements(second_page->'entries') y ON x->>'id'=y->>'id') THEN RAISE EXCEPTION 'History duplicated across cursor';END IF;
 v:=public.trusted_wallet_view('61000000-0000-4000-8000-000000000002');IF (v->>'balance')::numeric<>0 OR v->'entries'<>'[]' OR (v->'pendingTopups'->0->>'amount')::numeric<>8000 THEN RAISE EXCEPTION 'Other owner data leaked';END IF;
 PERFORM public.trusted_wallet_review_opening('61000000-0000-4000-8000-000000000001',0,repeat('e',64),'view-case','fixture');
 UPDATE checkout_private.wallet_control SET spending_enabled=true;
 IF NOT (public.trusted_wallet_view('61000000-0000-4000-8000-000000000001')->>'spendingEnabled')::boolean THEN RAISE EXCEPTION 'Reviewed consistent spending gate missing';END IF;
 IF (public.trusted_wallet_view('61000000-0000-4000-8000-000000000002')->>'spendingEnabled')::boolean THEN RAISE EXCEPTION 'Other unreviewed account enabled';END IF;
 IF has_function_privilege('anon','public.trusted_wallet_view(uuid,timestamptz,uuid,integer)','EXECUTE') OR has_function_privilege('authenticated','public.trusted_wallet_view(uuid,timestamptz,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'View RPC browser grant';END IF;
 BEGIN PERFORM public.trusted_wallet_view('61000000-0000-4000-8000-000000000001',now(),NULL);RAISE EXCEPTION 'Invalid cursor accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Invalid wallet view' THEN RAISE;END IF;END;
 BEGIN PERFORM public.trusted_wallet_view('61000000-0000-4000-8000-000000000001',NULL,NULL,51);RAISE EXCEPTION 'Unbounded history accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Invalid wallet view' THEN RAISE;END IF;END;
END $$;
SET ROLE service_role;
SELECT public.trusted_wallet_view('61000000-0000-4000-8000-000000000002');
RESET ROLE;
ROLLBACK;
\echo PASS: read-only wallet view, exact balances, review gates, owner isolation and keyset pagination.
