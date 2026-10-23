import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AddressRepository } from '../application/addressService';
import { addressFields, addressFromRecord } from '../domain/address';
export function createSupabaseAddressRepository(client: Pick<SupabaseClient<Database>, 'from'>): AddressRepository {
  const saved = (result: { data: { id: string } | null; error: unknown }, id: string) => {
    if (result.error) throw result.error;
    if (!result.data || result.data.id !== id) throw Error('Address change was not saved');
  };
  return {
    async list(ownerId) {
      const { data, error } = await client.from('addresses').select('*').eq('user_id', ownerId);
      if (error) throw error;
      return (data ?? []).map(addressFromRecord);
    },
    async save(ownerId, id, address, isNew) {
      const fields = addressFields(ownerId, id, address);
      const query = isNew ? client.from('addresses').insert(fields)
        : client.from('addresses').update(fields).eq('id', id).eq('user_id', ownerId);
      saved(await query.select('id').single(), id);
    },
    async remove(ownerId, id) {
      saved(await client.from('addresses').delete().eq('id', id).eq('user_id', ownerId).select('id').single(), id);
    },
    async clearDefaults(ownerId, exceptId) {
      let query = client.from('addresses').update({ is_default: false }).eq('user_id', ownerId);
      if (exceptId) query = query.neq('id', exceptId);
      const { error } = await query;
      if (error) throw error;
    },
    async markDefault(ownerId, id) {
      saved(await client.from('addresses').update({ is_default: true }).eq('id', id).eq('user_id', ownerId).select('id').single(), id);
    },
  };
}
