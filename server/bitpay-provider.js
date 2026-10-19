// bitpay.ir, not the unrelated bitpay.com cryptocurrency API.
// Official gateway-help-v2.2.pdf pp. 3-5 and api-test-V2.pdf p. 1.
import { createHash } from 'node:crypto';
const BASES = Object.freeze({ production: 'https://bitpay.ir/payment', test: 'https://bitpay.ir/payment-test' });
// Fingerprint only; never embed/use the published test credential in requests.
const TEST_KEY_SHA256 = 'b6e1c0e719e8ca8a7547fff767c4d547aa10611f4f92d5a2313795ab8f369369';

export class BitpayProviderError extends Error {
  constructor(code) {
    super(code); // Never include credentials, provider bodies or request data.
    this.name = 'BitpayProviderError';
    this.code = code;
  }
}

export function integerRial(value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9][0-9]*$/.test(String(value))) {
    throw new BitpayProviderError('INVALID_RIAL_AMOUNT');
  }
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new BitpayProviderError('INVALID_RIAL_AMOUNT');
  return amount;
}

const opaqueReference = value => typeof value === 'string' && value.length > 0
  && value.length <= 256 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value) && value !== '0';
const providerReference = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && value.length <= 256;
const resolve = value => typeof value === 'function' ? value() : value;
const fail = code => { throw new BitpayProviderError(code); };
const factor = value => {
  if (!['string', 'number'].includes(typeof value) || !/^(0|[1-9][0-9]*)$/.test(String(value))
    || !Number.isSafeInteger(Number(value))) fail('INVALID_FACTOR_ID');
  return String(value);
};

/**
 * The authenticated POST binds api + persisted id_get + candidate trans_id.
 * The documented response does not echo merchant/currency/transaction/reference.
 * No callback field or already-verified status is independent payment evidence.
 * Application idempotency is owned by the existing durable claim/attach RPCs.
 */
export function createBitpayProvider({ environment, credentialEnvironment, apiKey, merchant, callbackOrigin,
  fetchImpl = (...args) => fetch(...args), timeoutMs = 15000, newPaymentsEnabled = false } = {}) {
  if (!Object.hasOwn(BASES, environment) || credentialEnvironment !== environment) fail('INVALID_PROVIDER_ENVIRONMENT');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail('INVALID_TIMEOUT');
  if (typeof newPaymentsEnabled !== 'boolean') fail('INVALID_PAYMENT_SWITCH');
  const base = BASES[environment];
  const configuration = attempt => {
    const key = resolve(apiKey), account = resolve(merchant);
    if (typeof key !== 'string' || !key.trim() || typeof account !== 'string' || !account.trim()) fail('PROVIDER_NOT_CONFIGURED');
    if (key.length !== 52 || key.trim() !== key) fail('INVALID_PROVIDER_KEY');
    if (environment === 'production' && createHash('sha256').update(key).digest('hex') === TEST_KEY_SHA256) fail('PAYMENT_ENVIRONMENT_MISMATCH');
    // The existing durable merchant column also namespaces test data. A test
    // attempt can never be reused by a production adapter (or vice versa).
    if (account.startsWith('test:') !== (environment === 'test')) fail('PAYMENT_ENVIRONMENT_MISMATCH');
    if (attempt.provider !== 'bitpay' || attempt.merchant !== account || attempt.currency !== 'IRR') fail('PAYMENT_TERMS_MISMATCH');
    return { key, account, amount: integerRial(attempt.amount) };
  };
  const post = async (url, fields, read) => {
    const controller = new AbortController();
    let timer;
    // Race the complete request/body read too: injected transports or stalled
    // streams must not bypass the deadline by ignoring AbortSignal.
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new BitpayProviderError('PROVIDER_TIMEOUT'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await fetchImpl(url, { method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields).toString(), signal: controller.signal });
        if (!response.ok) fail('PROVIDER_HTTP_ERROR');
        return await read(response);
      })()]);
    } catch (error) {
      if (error instanceof BitpayProviderError) throw error;
      // This includes network errors, redirects, truncated bodies and bad JSON.
      throw new BitpayProviderError('PROVIDER_RESPONSE_UNRESOLVED');
    } finally {
      clearTimeout(timer);
    }
  };
  const verifyWire = async (attempt, transaction) => {
    const config = configuration(attempt);
    if (!providerReference(attempt.provider_ref) || !providerReference(transaction)) fail('INVALID_PROVIDER_REFERENCE');
    if (attempt.transaction_id != null && attempt.transaction_id !== transaction) fail('PAYMENT_BINDING_MISMATCH');
    const expectedFactor = attempt.factorId == null ? null : factor(attempt.factorId);
    const response = await post(`${base}/gateway-result-second`, { api: config.key, trans_id: transaction,
      id_get: attempt.provider_ref, json: '1' }, res => res.json());
    if (!response || typeof response !== 'object' || Array.isArray(response)
      || !Number.isInteger(response.status)) fail('PROVIDER_RESPONSE_UNRESOLVED');
    if (response.status === 11) fail('PAYMENT_ALREADY_VERIFIED');
    if ([-1, -2, -3, -4].includes(response.status)) fail(`PROVIDER_VERIFY_REJECTED_${-response.status}`);
    if (response.status !== 1) fail('PAYMENT_NOT_VERIFIED');
    if (integerRial(response.amount) !== config.amount) fail('PAYMENT_TERMS_MISMATCH');
    if (expectedFactor !== null && (typeof response.factorId !== 'string' || factor(response.factorId) !== expectedFactor)) fail('PAYMENT_BINDING_MISMATCH');
    // Optional echoed IDs are not required by v2.2. Reject contradictions if present.
    if ((response.id_get != null && response.id_get !== attempt.provider_ref)
      || (response.trans_id != null && response.trans_id !== transaction)) fail('PAYMENT_BINDING_MISMATCH');
    return response;
  };
  const provider = {
    newPaymentsEnabled,
    async create(attempt) {
      if (!newPaymentsEnabled) fail('PAYMENTS_DISABLED');
      const { key, account, amount } = configuration(attempt);
      if (amount < 5000) fail('INVALID_RIAL_AMOUNT');
      if (attempt.version !== 2 || attempt.state !== 'creating' || attempt.claimed !== true
        || !opaqueReference(attempt.id) || !opaqueReference(attempt.order_id)) fail('INVALID_PAYMENT_CLAIM');
      let origin;
      try { origin = new URL(resolve(callbackOrigin)); } catch { fail('INVALID_CALLBACK_ORIGIN'); }
      if (origin.protocol !== 'https:' || origin.username || origin.password
        || origin.pathname !== '/' || origin.search || origin.hash) fail('INVALID_CALLBACK_ORIGIN');
      const callback = new URL('/checkout/verify', origin);
      callback.searchParams.set('order_id', attempt.order_id);
      // No invented provider idempotency field or automatic create retry.
      const fields = { api: key, amount: String(amount), redirect: callback.href };
      if (attempt.factorId != null) fields.factorId = factor(attempt.factorId);
      const reference = (await post(`${base}/gateway-send`, fields, res => res.text())).trim();
      if (/^-[1-5]$/.test(reference)) fail(`PROVIDER_CREATE_REJECTED_${reference.slice(1)}`);
      if (!providerReference(reference)) fail('PROVIDER_CREATE_UNRESOLVED');
      // Amount/account/currency here describe our request, NOT echoed evidence.
      return { reference, amount, merchant: account, currency: 'IRR' };
    },
    redirect(reference) {
      if (!providerReference(reference)) fail('INVALID_PROVIDER_REFERENCE');
      return `${base}/gateway-${reference}-get`;
    },
    async verify(attempt, transaction) {
      if (!newPaymentsEnabled) fail('PAYMENTS_DISABLED');
      if (attempt.version !== 2 || attempt.state !== 'ready') fail('INVALID_PAYMENT_ATTEMPT');
      await verifyWire(attempt, transaction);
      const request = Object.freeze({ amount: integerRial(attempt.amount), currency: attempt.currency,
        merchant: attempt.merchant, reference: attempt.provider_ref, transaction });
      return { ...request };
    },
    async verifyLegacy(attempt, transaction) {
      if (attempt.version !== 1 || attempt.state !== 'ready') fail('INVALID_LEGACY_ATTEMPT');
      await verifyWire(attempt, transaction);
      // Legacy returns use the same documented verification and exact bindings.
      return { amount: integerRial(attempt.amount), currency: attempt.currency,
        merchant: attempt.merchant, reference: attempt.provider_ref, transaction };
    },
  };
  return Object.freeze(provider);
}

// Production checkout is an explicit operator opt-in. No provider request is
// made by configuration or import. Missing/invalid configuration fails closed.
export function productionPaymentEnabled(env = process.env) {
  if (env.BITPAY_NEW_PAYMENTS_ENABLED == null || env.BITPAY_NEW_PAYMENTS_ENABLED === 'false') return false;
  if (env.BITPAY_NEW_PAYMENTS_ENABLED !== 'true') fail('INVALID_PAYMENT_SWITCH');
  if (env.SUPABASE_URL !== 'https://klfmscuogsocfjxqkuib.supabase.co') fail('PAYMENT_DATABASE_MISMATCH');
  if (typeof env.BITPAY_API_KEY !== 'string' || env.BITPAY_API_KEY.length !== 52
    || env.BITPAY_API_KEY.trim() !== env.BITPAY_API_KEY) fail('INVALID_PROVIDER_KEY');
  if (createHash('sha256').update(env.BITPAY_API_KEY).digest('hex') === TEST_KEY_SHA256) fail('PAYMENT_ENVIRONMENT_MISMATCH');
  if (typeof env.BITPAY_MERCHANT_ACCOUNT !== 'string' || !env.BITPAY_MERCHANT_ACCOUNT.trim()
    || env.BITPAY_MERCHANT_ACCOUNT.trim() !== env.BITPAY_MERCHANT_ACCOUNT
    || env.BITPAY_MERCHANT_ACCOUNT.startsWith('test:')) fail('PROVIDER_NOT_CONFIGURED');
  if (env.BITPAY_CALLBACK_ORIGIN !== 'https://jamimode.ir') fail('INVALID_CALLBACK_ORIGIN');
  if (!env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) fail('PAYMENT_DATABASE_NOT_CONFIGURED');
  return true;
}
export const bitpayProvider = createBitpayProvider({
  environment: 'production', credentialEnvironment: 'production',
  newPaymentsEnabled: productionPaymentEnabled(),
  apiKey: () => process.env.BITPAY_API_KEY,
  merchant: () => process.env.BITPAY_MERCHANT_ACCOUNT,
  callbackOrigin: () => process.env.BITPAY_CALLBACK_ORIGIN,
});
export const legacyBitpayProvider = { verify: (...args) => bitpayProvider.verifyLegacy(...args) };
