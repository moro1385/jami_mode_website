import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { PaymentTransport } from '../application/paymentPorts';
import { WalletRequestError, validWalletId, type PaymentResult } from '../domain/wallet';
export function createSupabasePaymentTransport(client: Pick<SupabaseClient<Database>, 'auth'>, send: typeof fetch, timeout: (ms: number) => AbortSignal): PaymentTransport {
  return {
    async request(path, ownerId, body, signal) {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session || data.session.user.id !== ownerId) throw new WalletRequestError('AUTH_REQUIRED');
      const response = await send(path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + data.session.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: signal ?? timeout(15000) });
      const result = await response.json() as PaymentResult;
      if (!response.ok) throw Object.assign(new WalletRequestError(typeof result.code === 'string' ? result.code : 'UNAVAILABLE'), { topupId: validWalletId(result.topupId) ? result.topupId : undefined });
      return result;
    },
    async verify(kind, body) {
      const { data } = await client.auth.getSession();
      const response = await send(kind === 'order' ? '/api/bitpay/verify' : '/api/bitpay/wallet-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session?.access_token }, body: JSON.stringify(body),
      });
      return { ok: response.ok, result: await response.json() as PaymentResult };
    },
  };
}
