import { useCallback } from 'react';
import { ordersService } from '../orders';
import { useScopedOrderRead } from './useScopedOrderRead';
export function useAccountOrders(userId?: string) {
  const load = useCallback(() => ordersService.listAccount(userId!), [userId]);
  const { value, loading, error, retry } = useScopedOrderRead(userId, load);
  return { orders: value ?? [], loading, error, retry };
}
