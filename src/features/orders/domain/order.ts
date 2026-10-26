export type OrderSnapshot = {
  id: string; created_at: string; status: string; total_amount: number;
  shipping_cost: number; shipping_method: string | null;
  payment_method: string | null; shipping_address: string | null;
};
export type OrderItemSnapshot = {
  id: string; order_id: string; price: number; quantity: number;
  title: string | null; variant_title: string | null; image_url: string | null;
};
export type AdminOrder = Omit<OrderSnapshot, 'shipping_address'> & {
  user_id: string;
  checkout_version?: number; payment_state?: string;
  profiles: { first_name: string | null; last_name: string | null; phone: string | null } | null;
};
export type OrderDetails = { order: OrderSnapshot; items: OrderItemSnapshot[] };
export type AccountOrderRecord = {
  id: string; user_id: string; created_at: string; total_amount: number; status: string;
  order_items: Pick<OrderItemSnapshot, 'title' | 'variant_title' | 'quantity' | 'price'>[] | null;
};
export const orderStatusTranslations: Record<string, string> = {
  pending: 'در انتظار', processing: 'در حال پردازش', confirmed: 'تایید شده',
  shipped: 'ارسال شده', delivered: 'تحویل داده شده', cancelled: 'لغو شده',
  pending_payment: 'ناموفق', payment_failed: 'ناموفق',
};
export function accountOrder(record: AccountOrderRecord) {
  const delivery = record.status === 'confirmed' ? 'processing' : record.status;
  return {
    id: record.id, number: record.id.split('-')[0].toUpperCase(), createdAt: record.created_at,
    total: record.total_amount, currencyCode: 'IRR', status: record.status,
    deliveryStatus: orderStatusTranslations[delivery.toLowerCase()] || (record.status === 'confirmed' ? 'Processing' : record.status),
    lines: (record.order_items ?? []).map(line => ({
      title: line.title || 'محصول', variant: line.variant_title || 'پیش‌فرض',
      quantity: line.quantity, price: line.price,
    })),
  };
}

export type OrderStatus = 'pending' | 'pending_payment' | 'payment_failed' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type AccountOrder = ReturnType<typeof accountOrder>;
export type OrderLine = AccountOrder['lines'][number];
