import { supabase } from '@/integrations/supabase/client';
import { createCustomersService } from './application/customersService';
import { createSupabaseCustomersRepository } from './infrastructure/supabaseCustomersRepository';

export const adminCustomers = createCustomersService(createSupabaseCustomersRepository(supabase));
export { customerDisplayName } from './domain/customer';
export type { CustomerSummary } from './domain/customer';
