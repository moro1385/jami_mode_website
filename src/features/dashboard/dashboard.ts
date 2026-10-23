import { supabase } from '@/integrations/supabase/client';
import { createDashboardService } from './application/dashboardService';
import { createSupabaseDashboardRepository } from './infrastructure/supabaseDashboardRepository';
export const adminDashboard = createDashboardService(createSupabaseDashboardRepository(supabase));
