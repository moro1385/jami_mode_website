import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { GatewayRepository } from '../application/gatewayService';
import type { PaymentResult } from '../domain/wallet';
export function createSupabaseGatewayRepository(client: Pick<SupabaseClient<Database>, 'auth'>, send: typeof fetch): GatewayRepository {
  return {
    async connect(ownerId) {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session || data.session.user.id !== ownerId) throw Error('Authentication required');
      const token = data.session.access_token;
      return { async post(path, body) {
        const response = await send(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
        return { ok: response.ok, result: await response.json() as PaymentResult };
      } };
    },
  };
}
