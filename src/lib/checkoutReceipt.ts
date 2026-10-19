import type { CartItem } from '@/stores/cartStore';
export const validOrderId = (id: string | null): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
// A receipt URL cannot authorize clearing a later or different shopping cart.
export function consumeCheckoutReceipt(userId: string, orderId: string, items: CartItem[]): boolean {
  const key = 'trusted-checkout:' + userId;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved?.orderId !== orderId || typeof saved.selection !== 'string') return false;
    const selection = JSON.parse(saved.selection);
    const current = items.map(item => ({ productId: item.productId, quantity: item.quantity,
      size: item.selectedSize, color: item.selectedColor }));
    if (JSON.stringify(selection.items) !== JSON.stringify(current)) return false;
    sessionStorage.removeItem(key);
    return true;
  } catch { return false; }
}
