import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminOrder } from '../domain/order';
import type { OrdersRepository } from '../application/ordersService';
export function createSupabaseOrdersRepository(client: Pick<SupabaseClient<Database>, 'from'>): OrdersRepository {
  return {
    async listAdmin() {
      const { data, error } = await client.from('orders').select('id,created_at,status,total_amount,shipping_cost,shipping_method,payment_method,user_id,checkout_version,payment_state,profiles(first_name,last_name,phone)').order('created_at', { ascending: false });
      if (error) throw error;
      // Generated relationships omit the existing profiles join; keep the pre-refactor wire contract here.
      return (data ?? []) as unknown as AdminOrder[];
    },
    async changeStatus(id, previous, next) {
      const { data, error } = await client.from('orders').update({ status: next })
        .eq('id', id).eq('status', previous).select('id').single();
      if (error) throw error;
      if (!data) throw Error('Order status was not saved');
    },
    async listAccount(userId) {
      const { data, error } = await client.from('orders').select('*,order_items(*)')
        .eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    async details(id) {
      // RLS determines access for both admin and account callers; use immutable order snapshots.
      const [order, items] = await Promise.all([
        client.from('orders').select('id,created_at,status,total_amount,shipping_cost,shipping_method,payment_method,shipping_address').eq('id', id).single(),
        client.from('order_items').select('id,order_id,price,quantity,title,variant_title,image_url').eq('order_id', id),
      ]);
      if (order.error) throw order.error;
      if (items.error) throw items.error;
      if (!order.data) throw Error('Order not found');
      return { order: order.data, items: items.data ?? [] };
    },
  };
}
