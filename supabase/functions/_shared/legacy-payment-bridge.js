// Compatibility endpoints never hold a payment key or mutate financial tables.
// The fixed HTTPS destination owns binding, provider verification and atomic RPCs.
const PROJECT_URL = 'https://klfmscuogsocfjxqkuib.supabase.co';
const SITE_ORIGIN = 'https://jamimode.ir';
const cors = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
const methodResponse = req => req.method === 'OPTIONS'
  ? new Response(null, { status: 204, headers: cors })
  : req.method !== 'POST' ? json({ error: 'Method not allowed' }, 405) : null;
const uuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const reference = value => typeof value === 'string' && /^[1-9][0-9]{0,255}$/.test(value);
const reasons = new Set(['invalid', 'cancelled', 'verification_pending',
  'merchant_configuration_required', 'provider_contract_required']);

async function readJsonLimited(message, maxBytes) {
  const declared = message.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error('Body limit');
  if (!message.body) throw new Error('Missing body');
  const reader = message.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('Body limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    // Also close an oversized/malformed stream; never echo its contents.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createRetiredPaymentHandler({ wallet = false } = {}) {
  return async req => methodResponse(req) ?? json({ success: false,
    error: wallet ? 'Wallet top-ups are temporarily unavailable' : 'Use the current checkout to start a payment',
    code: wallet ? 'WALLET_TOPUPS_DISABLED' : 'LEGACY_PAYMENT_INIT_DISABLED',
  }, 410);
}

/**
 * @param {{wallet?: boolean, projectUrl?: () => string | undefined, fetchImpl?: typeof fetch, timeoutMs?: number}} options
 */
export function createLegacyVerificationHandler({ wallet = false, projectUrl,
  fetchImpl = (...args) => fetch(...args), timeoutMs = 25000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid timeout');
  const field = wallet ? 'topup_id' : 'order_id';
  const destination = SITE_ORIGIN + '/api/bitpay/' + (wallet ? 'wallet-verify' : 'verify');
  return async req => {
    const method = methodResponse(req);
    if (method) return method;
    // An accidental deployment to another project must never verify production payments.
    if (projectUrl?.() !== PROJECT_URL) return json({ success: false, reason: 'verification_pending' }, 503);
    let payload;
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') ?? '')) throw new Error('Invalid content type');
      const body = await readJsonLimited(req, 4096);
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => ![field, 'id_get', 'trans_id'].includes(key))
        || !uuid(body[field]) || !reference(body.id_get)
        || !(body.trans_id == null || body.trans_id === '0' || reference(body.trans_id))) throw new Error('Invalid callback');
      payload = { [field]: body[field], id_get: body.id_get, trans_id: body.trans_id ?? null };
    } catch {
      return json({ success: false, reason: 'invalid' });
    }
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Timeout')); }, timeoutMs);
    });
    try {
      // No retry, redirect following, caller-selected destination or credential forwarding.
      const result = await Promise.race([deadline, (async () => {
        const response = await fetchImpl(destination, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Unresolved upstream');
        const data = await readJsonLimited(response, 2048);
        if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.success !== 'boolean') throw new Error('Unresolved upstream');
        if (data.success) return { success: true };
        return { success: false, reason: reasons.has(data.reason) ? data.reason : 'verification_pending' };
      })()]);
      return json(result);
    } catch {
      return json({ success: false, reason: 'verification_pending' });
    } finally {
      clearTimeout(timer);
    }
  };
}
