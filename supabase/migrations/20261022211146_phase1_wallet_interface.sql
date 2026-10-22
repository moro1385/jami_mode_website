-- Read-only customer view; does not observe/review an opening or enable money flows.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.trusted_wallet_view(p_user uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE b numeric;a checkout_private.wallet_accounts;expected numeric;reviewed boolean;consistent boolean;history jsonb;pending jsonb;more boolean;
BEGIN
 IF p_user IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 OR (p_before IS NULL)<>(p_before_id IS NULL) OR (p_before IS NOT NULL AND NOT isfinite(p_before)) THEN RAISE EXCEPTION 'Invalid wallet view';END IF;
 SELECT wallet_balance INTO STRICT b FROM public.profiles WHERE id=p_user;
 IF b IS NULL OR b<0 OR b<>trunc(b) OR b>9007199254740991 THEN RAISE EXCEPTION 'Invalid wallet balance';END IF;
 SELECT * INTO a FROM checkout_private.wallet_accounts WHERE user_id=p_user;
 SELECT a.opening_balance+coalesce(sum(delta),0) INTO expected FROM checkout_private.wallet_entries WHERE user_id=p_user;
 consistent:=coalesce(expected=a.balance AND b=a.balance,false);
 reviewed:=EXISTS(SELECT 1 FROM checkout_private.wallet_opening_reviews r WHERE r.user_id=p_user AND r.opening_balance=a.opening_balance);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'amount',e.delta,'balanceAfter',e.balance_after,'createdAt',e.created_at,'orderId',e.order_id,'topupId',e.topup_id) ORDER BY e.created_at DESC,e.id DESC),'[]'::jsonb)
 INTO history FROM (SELECT * FROM checkout_private.wallet_entries WHERE user_id=p_user
 AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit) e;
 SELECT count(*)>p_limit INTO more FROM (SELECT 1 FROM checkout_private.wallet_entries WHERE user_id=p_user AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) LIMIT p_limit+1) e;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'amount',t.amount,'createdAt',t.created_at) ORDER BY t.created_at DESC,t.id DESC),'[]'::jsonb)
 INTO pending FROM (SELECT * FROM public.wallet_topups WHERE user_id=p_user AND payment_trans_id IS NULL AND status='pending_payment' ORDER BY created_at DESC,id DESC LIMIT 5) t;
 RETURN jsonb_build_object('balance',b,'currency','IRR','reviewed',reviewed,'consistent',consistent,
 'spendingEnabled',consistent AND reviewed AND coalesce((SELECT spending_enabled FROM checkout_private.wallet_control WHERE singleton),false),
 'topupsEnabled',coalesce((SELECT topups_enabled FROM checkout_private.wallet_control WHERE singleton),false),
 'entries',history,'hasMore',more,'pendingTopups',pending);
END $$;
REVOKE ALL ON FUNCTION public.trusted_wallet_view(uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trusted_wallet_view(uuid,timestamptz,uuid,integer) TO service_role;
COMMIT;
