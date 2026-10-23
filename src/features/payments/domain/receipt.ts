import { cartSelectionItems, type CartItem } from '@/features/cart/domain/cart';
export const validOrderId = (id: string | null): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function matchesCheckoutReceipt(raw: string | null, orderId: string, items: CartItem[]): boolean {
  try {
    const saved = JSON.parse(raw || 'null');
    if (saved?.orderId !== orderId || typeof saved.selection !== 'string') return false;
    const selection = JSON.parse(saved.selection);
    const current = cartSelectionItems(items);
    return JSON.stringify(selection.items) === JSON.stringify(current);
  } catch { return false; }
}
