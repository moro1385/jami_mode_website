import { createHash } from 'node:crypto';
export function createFakeProvider(config) {
  const sessions = new Map();
  const reference = attempt => String(BigInt('0x' + createHash('sha256')
    .update(`${attempt.id}:${attempt.amount}:${attempt.merchant}`).digest('hex').slice(0, 15)) + 1n);
  const check = attempt => {
    if (attempt.version !== 2 || attempt.provider !== 'bitpay' || attempt.currency !== 'IRR'
      || attempt.merchant !== config.merchant || !Number.isSafeInteger(Number(attempt.amount))
      || Number(attempt.amount) < 5000) throw new Error('Invalid fake payment terms');
  };
  return {
    newPaymentsEnabled: true,
    async create(attempt) {
      check(attempt);
      if (attempt.state !== 'creating' || !attempt.claimed) throw new Error('Invalid fake claim');
      const ref = reference(attempt);
      sessions.set(ref, { orderId: attempt.order_id, approved: false });
      return { reference: ref, merchant: config.merchant, currency: 'IRR', amount: Number(attempt.amount) };
    },
    redirect(ref) {
      if (!/^[1-9][0-9]*$/.test(ref)) throw new Error('Invalid fake reference');
      return `${config.backendOrigin}/fake-payments/${ref}`;
    },
    session(ref) { return sessions.get(ref); },
    complete(ref, approved) {
      const session = sessions.get(ref);
      if (!session) throw new Error('Unknown fake session; restart with a new test order');
      // Cancellation never downgrades a previously approved fake payment.
      session.approved ||= approved;
      const callback = new URL('/checkout/verify', config.frontendOrigin);
      callback.searchParams.set('order_id', session.orderId);
      callback.searchParams.set('id_get', ref);
      callback.searchParams.set('trans_id', approved ? '9' + ref : '0');
      return callback.href;
    },
    async verify(attempt, transaction) {
      check(attempt);
      const ref = reference(attempt);
      if (attempt.state !== 'ready' || attempt.provider_ref !== ref || transaction !== '9' + ref
        || !sessions.get(ref)?.approved) throw new Error('Fake payment was not approved');
      return { amount: Number(attempt.amount), merchant: config.merchant, currency: 'IRR',
        reference: ref, transaction };
    },
  };
}
export const blockedLegacyProvider = Object.freeze({
  async verify() { throw new Error('Legacy provider transport is blocked in local tests'); },
});
