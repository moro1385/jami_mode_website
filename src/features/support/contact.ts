import { supabase } from '@/integrations/supabase/client';
import { createContactService } from './application/supportServices';
import { createSupabaseContactRepository } from './infrastructure/supabaseSupportRepositories';
export const contactSupport = createContactService(createSupabaseContactRepository(supabase));
