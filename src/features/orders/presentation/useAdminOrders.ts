import { useCallback } from 'react';
import { toast } from 'sonner';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { ordersService } from '../orders';
import { fulfillmentOptions } from '../domain/fulfillment';
export function useAdminOrders(ownerId?: string) {
 const load = useCallback(() => ordersService.listAdmin(), []);
 const read = useScopedAsyncRead(ownerId, load), actions = useScopedAction(ownerId);
 async function changeStatus(id: string, status: string) {
  const order = read.value?.find(row => row.id === id);
  if (!order || order.status === status || !fulfillmentOptions(order.status).includes(status)) return;
  const result = await actions.run(id, () => ordersService.changeStatus(id, order.status, status));
  if (result.kind === 'success') { toast.success(`وضعیت سفارش به‌روز شد به ${status}`); read.retry(); }
  else if (result.kind === 'failed') { console.error('Order update failed:', result.error); toast.error('به‌روزرسانی وضعیت با شکست مواجه شد'); read.retry(); }
 }
 return { orders: read.value ?? [], loading: read.loading, error: read.error, retry: read.retry, pending: actions.pending, changeStatus };
}
