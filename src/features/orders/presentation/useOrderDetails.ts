import { useCallback } from 'react';
import { ordersService } from '../orders';
import { useScopedOrderRead } from './useScopedOrderRead';
export function useOrderDetails(open: boolean, orderId: string | null, actorId?: string) {
  const load = useCallback(() => ordersService.details(orderId!), [orderId]);
  const scope = open && orderId && actorId ? JSON.stringify([actorId, orderId]) : undefined;
  const { value, loading, error, retry } = useScopedOrderRead(scope, load);
  return { order: value?.order ?? null, items: value?.items ?? [], isLoading: loading, error, retry };
}
