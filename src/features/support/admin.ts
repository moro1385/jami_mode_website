import { supabase } from '@/integrations/supabase/client';
import { createAdminSupportService } from './application/supportServices';
import { createSupabaseAdminSupportRepository } from './infrastructure/supabaseSupportRepositories';
export const adminSupport = createAdminSupportService(createSupabaseAdminSupportRepository(supabase));
export type { SupportMessage, SupportTicket } from './domain/support';
