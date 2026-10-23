import { supabase } from '@/integrations/supabase/client';
import { createAddressService } from './application/addressService';
import { createSupabaseAddressRepository } from './infrastructure/supabaseAddressRepository';
export const accountAddresses = createAddressService(createSupabaseAddressRepository(supabase), () => crypto.randomUUID());
