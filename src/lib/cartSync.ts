import { useCartStore } from '@/stores/cartStore';
import { accountCart } from '@/features/cart/cart';
export { parseCartItems } from '@/features/cart/domain/cart';
export function flushCartToServer(userId: string): Promise<void> {
  return accountCart.flush(userId, useCartStore.getState().items);
}
