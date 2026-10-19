const SMS_URL = 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';
const json = outcome => new Response(JSON.stringify(outcome.body), {
  status: outcome.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    ...(outcome.retryAfter ? { 'Retry-After': outcome.retryAfter } : {}) },
});
const failure = (status, message, retryAfter) => ({ status, body: { error: { http_code: status, message } }, retryAfter });
const unavailable = () => failure(500, 'SMS delivery could not be confirmed.');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function signingSecrets(value) {
  if (typeof value !== 'string' || !value || value.length > 1024) throw new Error('Configuration');
  const parts = value.split('|');
  if (parts.length > 2) throw new Error('Configuration');
  return parts.map(part => {
    const secret = part.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new Error('Configuration');
    const bytes = atob(secret);
    if (bytes.length < 32 || bytes.length > 256 || btoa(bytes) !== secret) throw new Error('Configuration');
    return secret;
  });
}

async function readLimitedText(message, limit, signal) {
  const length = message.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Error('Body limit');
  if (!message.body || signal.aborted) throw new Error('Body unavailable');
  const reader = message.body.getReader();
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let bytes = 0, text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (signal.aborted) throw new Error('Timeout');
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new Error('Body limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * @param {{verifyWebhook: (raw: string, headers: Record<string, string>, secret: string) => unknown,
 * getHookSecrets: () => string | undefined,
 * getProviderCredentials: () => {username: string | undefined, password: string | undefined},
 * fetchImpl?: typeof fetch, timeoutMs?: number, minIntervalMs?: number, maxEntries?: number, now?: () => number}} options
 */
export function createSmsHookHandler({ verifyWebhook, getHookSecrets, getProviderCredentials,
  fetchImpl = (...args) => fetch(...args), timeoutMs = 4000, minIntervalMs = 30000,
  maxEntries = 1024, now = () => Date.now() }) {
  if (![timeoutMs, minIntervalMs, maxEntries].every(Number.isInteger)
    || timeoutMs < 1 || timeoutMs > 4500 || minIntervalMs < 1 || maxEntries < 1 || maxEntries > 10000) throw new Error('Invalid hook options');
  // These bounded caches protect one worker only. Signature/timestamp validation
  // is mandatory in every worker; Auth's configured global limits must remain on.
  const events = new Map();
  const phones = new Map();
  return async req => {
    if (req.method !== 'POST') return json(failure(405, 'Method not allowed.'));
    const headers = Object.fromEntries(['webhook-id', 'webhook-timestamp', 'webhook-signature']
      .map(name => [name, req.headers.get(name) ?? '']));
    if (!/^[\x21-\x7e]{1,256}$/.test(headers['webhook-id'])
      || !/^[0-9]{1,16}$/.test(headers['webhook-timestamp'])
      || !headers['webhook-signature'] || headers['webhook-signature'].length > 4096) return json(failure(401, 'Invalid webhook signature.'));
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') ?? '')) return json(failure(415, 'Expected JSON.'));
    let secrets;
    try { secrets = signingSecrets(getHookSecrets()); }
    catch { return json(failure(503, 'SMS hook is not configured.')); }
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Timeout')); }, timeoutMs);
    });
    const process = async () => {
      let raw;
      try { raw = await readLimitedText(req, 20480, controller.signal); }
      catch { return failure(400, 'Invalid webhook body.'); }
      let payload, verified = false;
      for (const secret of secrets) {
        try { payload = verifyWebhook(raw, headers, secret); verified = true; break; }
        catch { /* Never log signed payloads, headers, secrets or verifier errors. */ }
      }
      if (!verified) return failure(401, 'Invalid webhook signature.');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !uuid(payload.user?.id)
        || typeof payload.user?.phone !== 'string' || !payload.sms || typeof payload.sms !== 'object') return failure(400, 'Invalid SMS payload.');
      const candidates = [payload.sms.otp, payload.sms.code].filter(value => value !== undefined);
      if (!candidates.length || candidates.some(value => typeof value !== 'string' || !/^[0-9]{6,10}$/.test(value))
        || new Set(candidates).size !== 1) return failure(400, 'Invalid SMS payload.');
      const otp = candidates[0];
      let phone = payload.user.phone;
      if (phone.startsWith('+98')) phone = '0' + phone.slice(3);
      else if (phone.startsWith('98')) phone = '0' + phone.slice(2);
      if (!/^09[0-9]{9}$/.test(phone)) return failure(400, 'Unsupported phone number.');
      const time = now();
      for (const [key, entry] of events) if (entry.expiresAt <= time) events.delete(key);
      for (const [key, expiresAt] of phones) if (expiresAt <= time) phones.delete(key);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))))
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (controller.signal.aborted) return unavailable();
      const previous = events.get(headers['webhook-id']);
      if (previous) return previous.digest === digest ? await previous.result : failure(409, 'Webhook identifier conflict.');
      if (phones.has(phone)) return failure(429, 'Please wait before requesting another SMS.', '30');
      if (events.size >= maxEntries || phones.size >= maxEntries) return failure(503, 'SMS hook is busy.');
      let credentials;
      try { credentials = getProviderCredentials(); }
      catch { return failure(503, 'SMS provider is not configured.'); }
      if (typeof credentials?.username !== 'string' || !credentials.username
        || typeof credentials?.password !== 'string' || !credentials.password) return failure(503, 'SMS provider is not configured.');
      const dispatch = async () => {
        const response = await fetchImpl(SMS_URL, { method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: credentials.username, password: credentials.password,
            text: [otp], to: phone, bodyId: 537763 }),
        });
        if (!response.ok) return unavailable();
        const result = JSON.parse(await readLimitedText(response, 8192, controller.signal));
        if (!result || typeof result !== 'object' || Array.isArray(result)
          || ![1, '1'].includes(result.RetStatus) || controller.signal.aborted) return unavailable();
        return { status: 200, body: {} };
      };
      // Claim before yielding; concurrent duplicates share one bounded outcome.
      // Ambiguous delivery stays failed for this event in this worker, not retried.
      const result = Promise.race([Promise.resolve().then(dispatch), deadline]).catch(unavailable);
      events.set(headers['webhook-id'], { digest, result,
        expiresAt: Math.max(time, Number(headers['webhook-timestamp']) * 1000 + 300000) + 1000 });
      phones.set(phone, time + minIntervalMs);
      return await result;
    };
    try { return json(await Promise.race([process(), deadline])); }
    catch { return json(unavailable()); }
    finally { clearTimeout(timer); controller.abort(); }
  };
}
