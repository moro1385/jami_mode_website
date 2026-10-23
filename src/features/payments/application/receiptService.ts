import type { CartItem } from '@/features/cart/domain/cart';
import { matchesCheckoutReceipt, validOrderId } from '../domain/receipt';
import type { PaymentTransport, ReceiptStorage } from './paymentPorts';
export function createReceiptService(transport: PaymentTransport, storage: ReceiptStorage) {
  return {
    async read(ownerId: string, orderId: string | null, signal?: AbortSignal) {
      if (!ownerId || !validOrderId(orderId)) throw Error('Invalid receipt');
      const result = await transport.request('/api/bitpay/orders/' + orderId + '/status', ownerId, undefined, signal);
      if (result.orderId !== orderId || typeof result.paid !== 'boolean') throw Error('Unavailable');
      return { paid: result.paid };
    },
    consume(ownerId: string, orderId: string, items: CartItem[]) {
      const key = 'trusted-checkout:' + ownerId;
      try {
        if (!matchesCheckoutReceipt(storage.getItem(key), orderId, items)) return false;
        storage.removeItem(key); return true;
      } catch { return false; }
    },
  };
}
