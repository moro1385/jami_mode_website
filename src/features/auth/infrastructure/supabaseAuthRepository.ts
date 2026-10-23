import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { addressFromRecord } from '@/features/account/domain/address';
import type { AuthRepository } from '../application/authRepository';
export function createSupabaseAuthRepository(client: Pick<SupabaseClient<Database>, 'auth' | 'from' | 'rpc'>): AuthRepository {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      return error ? null : data.session;
    },
    subscribe(listener) { client.auth.onAuthStateChange((event, session) => { listener(event, session); }); },
    async signIn(phone, password) {
      const { data, error } = await client.auth.signInWithPassword({ phone, password });
      if (error) throw Error(error.message);
      return data;
    },
    async signUp(input) {
      const { data, error } = await client.auth.signUp({ phone: input.phone, password: input.password,
        options: { data: { first_name: input.firstName, last_name: input.lastName } } });
      if (error) throw Error(error.message);
      return data;
    },
    async phoneExists(phone) {
      const { data } = await client.from('profiles').select('id').eq('phone', phone).maybeSingle();
      return !!data;
    },
    async requestOtp(phone) {
      const { error } = await client.auth.signInWithOtp({ phone });
      if (error) throw Error(error.message);
    },
    async verifyOtp(phone, code) {
      const { error } = await client.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (error) throw Error(error.message);
    },
    async signOut() { const { error } = await client.auth.signOut(); if (error) throw Error(error.message); },
    async profile(userId) {
      const { data } = await client.from('profiles').select('*').eq('id', userId).single();
      return data;
    },
    async addresses(userId) {
      const { data } = await client.from('addresses').select('*').eq('user_id', userId);
      return (data ?? []).map(addressFromRecord);
    },
    async isAdmin(userId) {
      const { data, error } = await client.rpc('has_role', { _user_id: userId, _role: 'admin' });
      return !error && data === true;
    },
  };
}
