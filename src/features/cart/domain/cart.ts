import type { DisplayMoney } from '@/shared/domain/commerce';
import { z } from 'zod/mini';

export interface CartItem {
  id: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  image: string;
  price: DisplayMoney;
  quantity: number;
  selectedSize: string | null;
  selectedColor: string | null;
}

const cartItemSchema = z.object({
  id: z.string(), productId: z.string(), productTitle: z.string(),
  productHandle: z.string(), image: z.string(),
  price: z.object({ amount: z.string(), currencyCode: z.string() }),
  quantity: z.int().check(z.positive(), z.maximum(100)),
  selectedSize: z.nullable(z.string()), selectedColor: z.nullable(z.string()),
});

export function validatedCartItems(value: unknown): CartItem[] | null {
  const parsed = z.array(cartItemSchema).check(z.maxLength(100)).safeParse(value);
  return parsed.success ? parsed.data.map(item => ({
    id: item.id, productId: item.productId, productTitle: item.productTitle,
    productHandle: item.productHandle, image: item.image,
    price: { amount: item.price.amount, currencyCode: item.price.currencyCode },
    quantity: item.quantity, selectedSize: item.selectedSize, selectedColor: item.selectedColor,
  })) : null;
}

export function parseCartItems(value: unknown): CartItem[] { return validatedCartItems(value) ?? []; }


export function cartItemId(item: Omit<CartItem, 'id'>) {
  return `${item.productId}::${item.selectedSize ?? 'none'}::${item.selectedColor ?? 'none'}`;
}
export function addCartItem(items: CartItem[], item: Omit<CartItem, 'id'>): CartItem[] {
  const id = cartItemId(item);
  return items.some(existing => existing.id === id)
    ? items.map(existing => existing.id === id ? { ...existing, quantity: existing.quantity + item.quantity } : existing)
    : [...items, { ...item, id }];
}
export function removeCartItem(items: CartItem[], id: string) { return items.filter(item => item.id !== id); }
export function updateCartQuantity(items: CartItem[], id: string, quantity: number) {
  return quantity <= 0 ? removeCartItem(items, id) : items.map(item => item.id === id ? { ...item, quantity } : item);
}
export function cartSummary(items: CartItem[]) {
  return { subtotal: items.reduce((sum, item) => sum + parseFloat(item.price.amount) * item.quantity, 0), currency: items[0]?.price.currencyCode ?? 'USD' };
}
export function serializeCartItems(items: CartItem[]) {
  return items.map(item => ({
    id: item.id, productId: item.productId, productTitle: item.productTitle, productHandle: item.productHandle,
    image: item.image, price: { amount: item.price.amount, currencyCode: item.price.currencyCode },
    quantity: item.quantity, selectedSize: item.selectedSize, selectedColor: item.selectedColor,
  }));
}

export type CheckoutItemSelection = { productId: string; quantity: number; size?: string | null; color?: string | null };
// Legacy storefront variant IDs are display IDs, not database variant IDs.
// Checkout resolves its authoritative inventory row from product plus selected options on the server.
export function cartSelectionItems(items: CartItem[]): CheckoutItemSelection[] {
  return items.map(item => ({ productId: item.productId, quantity: item.quantity, size: item.selectedSize, color: item.selectedColor }));
}
