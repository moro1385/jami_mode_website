import { supabase } from '@/integrations/supabase/client';
import { createGatewayService } from './application/gatewayService';
import { createSupabaseGatewayRepository } from './infrastructure/supabaseGatewayRepository';
export const gatewayCheckout = createGatewayService(createSupabaseGatewayRepository(supabase, (path, init) => fetch(path, init)), {
  getItem: key => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value), removeItem: key => sessionStorage.removeItem(key),
}, () => crypto.randomUUID());
