import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { DashboardRepository } from '../application/dashboardService';
export function createSupabaseDashboardRepository(client: Pick<SupabaseClient<Database>, 'from'>): DashboardRepository {
  return { async read() {
    const [products, orders, users] = await Promise.all([
      client.from('products').select('id', { count: 'exact', head: true }),
      client.from('orders').select('id, total_amount', { count: 'exact' }),
      client.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    if (products.error) throw products.error;
    if (orders.error) throw orders.error;
    if (users.error) throw users.error;
    return { products: products.count, orders: orders.count, users: users.count, amounts: orders.data ?? [] };
  } };
}
