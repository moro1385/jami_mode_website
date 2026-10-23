import { supabase } from '@/integrations/supabase/client';
import { createOrdersService } from './application/ordersService';
import { createSupabaseOrdersRepository } from './infrastructure/supabaseOrdersRepository';
export const ordersService = createOrdersService(createSupabaseOrdersRepository(supabase));
export type { AdminOrder } from './domain/order';
