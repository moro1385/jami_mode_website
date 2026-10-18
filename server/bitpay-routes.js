import { Router } from 'express';
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
  merchant = () => process.env.BITPAY_MERCHANT_ACCOUNT } = {}) {
  const router = Router();
  const enabled = provider?.newPaymentsEnabled === true;
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
        return res.status(200).json(result);
      } catch {
        return res.status(409).json({ error: 'Checkout rejected. Refresh selections and review a new quote.' });
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
      return res.status(409).json({ error: 'Payment initiation unresolved; retry status or contact support' });
    }
  });
  router.post('/wallet-init', (_req, res) => res.status(503).json({ error: 'Wallet top-ups are temporarily unavailable', code: 'WALLET_TOPUPS_DISABLED' }));
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
        if (attempt.state === 'settled') return res.status(200).json({ success: nonempty(attempt.transaction_id) && trans_id === attempt.transaction_id });
        // Browser cancellation is advisory; never mutate financial state.
        if (!trans_id || trans_id === '0') return res.status(200).json({ success: false, reason: 'cancelled' });
        const adapter = attempt.version === 1 ? legacy : provider;
        if (!adapter || (attempt.version !== 1 && !enabled)) return res.status(503).json({ success: false, reason: 'provider_contract_required' });
        const verified = await adapter.verify(attempt, trans_id);
        if (attempt.currency !== 'IRR' || verified.currency !== attempt.currency || integerRial(verified.amount) !== integerRial(attempt.amount) || verified.merchant !== attempt.merchant
          || verified.reference !== attempt.provider_ref || verified.transaction !== trans_id) throw new Error('Verification binding mismatch');
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
