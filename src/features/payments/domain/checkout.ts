import { cartSelectionItems, type CartItem } from '@/features/cart/domain/cart';
import type { Address } from '@/features/account/domain/address';
import type { CheckoutSelection, PaymentResult } from './wallet';
export type GatewayQuote = { quote: string; total: number; shipping: number; selection: string };
export const shippingMethods = [
  { id: 'express', label: 'پست پیشتاز', cost: 2000000 },
  { id: 'tipax', label: 'پس‌کرایه (تیپاکس)', cost: 0 },
];
export function checkoutSelection(addressId: string, shippingOption: string, items: CartItem[]): CheckoutSelection {
  return { addressId, shippingOption, items: cartSelectionItems(items) };
}
export function gatewayQuote(result: PaymentResult, selection: string): GatewayQuote {
  if (typeof result.quote !== 'string' || !result.quote || !Number.isSafeInteger(result.total) || result.total! <= 0 || !Number.isSafeInteger(result.shipping) || result.shipping! < 0) throw Error('Invalid quote');
  return { quote: result.quote, total: result.total!, shipping: result.shipping!, selection };
}
export function reconcileCheckoutAddress(addresses: Address[], selected: Address | null): Address | null {
  return addresses.find(address => address.id === selected?.id) ?? addresses.find(address => address.isDefault) ?? addresses[0] ?? null;
}
