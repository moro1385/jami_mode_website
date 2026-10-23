import { supabase } from '@/integrations/supabase/client';
import { createReturnsService } from './application/returnsService';
import { createSupabaseReturnsRepository } from './infrastructure/supabaseReturnsRepository';
export const returnsService = createReturnsService(createSupabaseReturnsRepository(supabase));
export type { ReturnRequest, ReturnOrder } from './domain/returnRequest';
