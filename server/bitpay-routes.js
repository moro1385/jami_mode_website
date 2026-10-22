import { Router } from 'express';
import { mountWalletTopups } from './wallet-topups.js';
import { createClient } from '@supabase/supabase-js';
import { bitpayProvider, legacyBitpayProvider, integerRial } from './bitpay-provider.js';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const adminClient = () => createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authenticate = async header => {
  if (!header?.startsWith('Bearer ')) return null;
  const client = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_ANON_KEY ?? '', {
    global: { headers: { Authorization: header } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
};

export function createPaymentRouter({ admin = adminClient, auth = authenticate, legacy = legacyBitpayProvider, provider = bitpayProvider,
  merchant = () => process.env.BITPAY_MERCHANT_ACCOUNT,
  recoveryEnabled = process.env.PAYMENT_RECOVERY_ENABLED === 'true',
  topupsEnabled = process.env.JAMI_WALLET_TOPUPS_ENABLED === 'true' } = {}) {
  const router = Router();
  const enabled = provider?.newPaymentsEnabled === true;
  router.get('/orders/:id/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const user = await auth(req.headers.authorization);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(404).json({ error: 'Order not found' });
      const { data: order, error } = await admin().from('orders')
        .select('id,user_id,payment_state,payment_method,payment_trans_id')
        .eq('id', req.params.id).eq('user_id', user.id).maybeSingle();
      if (error) throw new Error('Unavailable');
      if (!order || order.user_id !== user.id) return res.status(404).json({ error: 'Order not found' });
      let paid = order.payment_method === 'gateway' && order.payment_state === 'paid' && nonempty(order.payment_trans_id);
      if (order.payment_method === 'wallet' && order.payment_state === 'paid') {
        const proof = await admin().rpc('trusted_wallet_receipt', { p_order: order.id, p_user: user.id });
        if (proof.error) throw new Error('Unavailable');
        paid = proof.data === true;
      }
      return res.status(200).json({ orderId: order.id, paid });
    } catch { return res.status(503).json({ error: 'Order status unavailable' }); }
  });
  const rpc = async (client, name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || 'Database transaction failed');
    if (data == null) throw new Error('Missing transaction result');
    return data;
  };
  for (const [path, create] of [['/checkout/quote', false], ['/checkout', true]]) {
    router.post(path, async (req, res) => {
      try {
        const user = await auth(req.headers.authorization);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        const { idempotencyKey, selection, quote } = req.body;
        if (!nonempty(idempotencyKey) || !selection || (create && !nonempty(quote))
          || Object.keys(req.body).some(key => !['idempotencyKey','selection','quote'].includes(key))) {
          return res.status(400).json({ error: 'Invalid checkout request' });
        }
        if (create && !enabled) return res.status(503).json({ error: 'Checkout creation is disabled', code: 'GATEWAY_DISABLED' });
        const result = await rpc(admin(), 'trusted_checkout', { p_user: user.id, p_key: idempotencyKey,
          p_request: selection, p_quote: create ? quote : null });
        if (result.code === 'CHECKOUT_EXPIRED') return res.status(409).json({ code: 'CHECKOUT_EXPIRED', error: 'Checkout expired; review a new quote' });
        if (result.code === 'PENDING_ORDER_LIMIT') return res.status(429).json({ code: 'PENDING_ORDER_LIMIT', error: 'Resolve pending orders before creating another' });
        return res.status(200).json(result);
      } catch (error) {
        return res.status(409).json({ error: 'Checkout rejected. Refresh selections and review a new quote.',
          ...(error.message === 'Checkout expired' ? { code: 'CHECKOUT_EXPIRED' } : {}) });
      }
    });
  }
  router.post('/init', async (req, res) => {
    try {
      const user = await auth(req.headers.authorization);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (!nonempty(req.body.orderId)) return res.status(400).json({ error: 'orderId required' });
      // Fail before claiming an attempt when no reviewed provider is installed.
      if (!enabled || !nonempty(merchant())) return res.status(503).json({ error: 'New gateway initiation is disabled', code: 'GATEWAY_DISABLED' });
      const client = admin();
      const attempt = await rpc(client, 'trusted_payment_claim', {
        p_order: req.body.orderId, p_user: user.id, p_merchant: merchant(),
      });
      if (attempt.state === 'settled') return res.status(200).json({ success: true });
      if (!attempt.claimed && attempt.state === 'creating') {
        return res.status(409).json({ error: 'Payment initiation pending reconciliation', code: 'PAYMENT_AMBIGUOUS' });
      }
      let ready = attempt;
      if (attempt.claimed) {
        // The durable creating state precedes the network request. A crash or
        // timeout cannot authorize another create. Do not retry it blindly.
        const session = await provider.create({ ...attempt, amount: integerRial(attempt.amount) });
        if (session.merchant !== attempt.merchant || session.amount !== integerRial(attempt.amount) || attempt.currency !== 'IRR' || session.currency !== attempt.currency) throw new Error('Provider create binding mismatch');
        ready = await rpc(client, 'trusted_payment_attach', { p_attempt: attempt.id, p_ref: session.reference });
      }
      return res.status(200).json({ redirectUrl: provider.redirect(ready.provider_ref) });
    } catch {
      return res.status(409).json({ error: 'Payment initiation unresolved; check order status or contact support', code: 'PAYMENT_AMBIGUOUS' });
    }
  });
  mountWalletTopups(router, { admin, auth, provider, merchant, topupsEnabled });
  for (const [path, wallet] of [['/verify', false], ['/wallet-verify', true]]) {
    router.post(path, async (req, res) => {
      try {
        const { order_id, topup_id, trans_id, id_get } = req.body;
        if (!nonempty(wallet ? topup_id : order_id) || !nonempty(id_get)
          || (trans_id != null && typeof trans_id !== 'string')) return res.status(200).json({ success: false, reason: 'invalid' });
        if (!nonempty(merchant())) return res.status(503).json({ success: false, reason: 'merchant_configuration_required' });
        const client = admin();
        const attempt = await rpc(client, 'trusted_payment_lookup', {
          p_id: wallet ? topup_id : order_id, p_wallet: wallet, p_ref: id_get, p_merchant: merchant(),
        });
        // Check the persisted lookup binding even when a replacement/mock RPC
        // returns an inconsistent row. Callback values never override it.
        if (attempt.provider_ref !== id_get || attempt.merchant !== merchant()
          || (attempt.transaction_id != null && trans_id && trans_id !== '0' && attempt.transaction_id !== trans_id)) throw new Error('Callback binding mismatch');
        let walletOwner;
        if (wallet && attempt.version === 2) {
          if (attempt.topup_id !== topup_id || attempt.order_id != null) throw new Error('Topup binding mismatch');
          walletOwner = await auth(req.headers?.authorization);
          if (!walletOwner) return res.status(401).json({ success: false, reason: 'verification_pending' });
          // Check ownership before even replaying a settled receipt. New wallet
          // verification always uses durable evidence, regardless of the order switch.
          const receipt = await rpc(client, 'trusted_wallet_topup_status', { p_user: walletOwner.id, p_topup: topup_id });
          if (receipt.topupId !== topup_id) throw new Error('Topup owner mismatch');
          if (attempt.state === 'settled') return res.status(200).json({ success: receipt.paid === true && nonempty(attempt.transaction_id) && trans_id === attempt.transaction_id });
        }
        if (attempt.state === 'settled') return res.status(200).json({ success: nonempty(attempt.transaction_id) && trans_id === attempt.transaction_id });
        // Browser cancellation is advisory; never mutate financial state.
        if (!trans_id || trans_id === '0') return res.status(200).json({ success: false, reason: 'cancelled' });
        const adapter = attempt.version === 1 ? legacy : provider;
        if (!adapter || (attempt.version !== 1 && !enabled)) return res.status(503).json({ success: false, reason: 'provider_contract_required' });
        // Preserve legacy callback transport; legacy recovery needs its own authenticated design.
        const recover = (recoveryEnabled || wallet) && attempt.version === 2;
        let verified;
        if (recover) {
          // A public callback must not poison the durable claim with a forged transaction.
          const customer = walletOwner ?? await auth(req.headers?.authorization);
          if (!customer) return res.status(401).json({ success: false, reason: 'verification_pending' });
          const claim = await rpc(client, 'trusted_verification_claim', { p_attempt: attempt.id, p_transaction: trans_id, p_user: customer.id });
          if (claim.state === 'verified') verified = claim.evidence;
          else if (claim.claimed === true && claim.state === 'verifying') verified = await adapter.verify(attempt, trans_id);
          else return res.status(200).json({ success: false, reason: 'verification_pending' });
        } else verified = await adapter.verify(attempt, trans_id);
        if (attempt.currency !== 'IRR' || verified.currency !== attempt.currency || integerRial(verified.amount) !== integerRial(attempt.amount) || verified.merchant !== attempt.merchant
          || verified.reference !== attempt.provider_ref || verified.transaction !== trans_id) throw new Error('Verification binding mismatch');
        if (recover) await rpc(client, 'trusted_verification_record', { p_attempt: attempt.id,
          p_amount: integerRial(verified.amount), p_merchant: verified.merchant, p_ref: verified.reference, p_transaction: verified.transaction });
        const settled = await rpc(client, 'trusted_payment_settle', { p_attempt: attempt.id,
          p_amount: integerRial(verified.amount), p_merchant: verified.merchant, p_ref: verified.reference, p_transaction: verified.transaction });
        return res.status(200).json(settled);
      } catch {
        // Never report success after a failed/ambiguous database write.
        return res.status(200).json({ success: false, reason: 'verification_pending' });
      }
    });
  }
  return router;
}
export default createPaymentRouter();
