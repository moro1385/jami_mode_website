import { supabase } from '@/integrations/supabase/client';
import { createAccountMessagesService } from './application/supportServices';
import { createSupabaseAccountMessagesRepository } from './infrastructure/supabaseSupportRepositories';
export const accountMessages = createAccountMessagesService(createSupabaseAccountMessagesRepository(supabase));
