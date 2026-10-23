import { gatewayQuote, type GatewayQuote } from '../domain/checkout';
import { safeTopupRedirect, validWalletId, type CheckoutSelection, type PaymentResult } from '../domain/wallet';
export type GatewayEndpoint = '/api/bitpay/checkout/quote' | '/api/bitpay/checkout' | '/api/bitpay/init';
export interface GatewayRepository {
  connect(ownerId: string): Promise<{ post(path: GatewayEndpoint, body: object): Promise<{ ok: boolean; result: PaymentResult }> }>;
}
export interface CheckoutStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
type Outcome = { kind: 'stale' | 'expired' | 'limit' | 'ambiguous' | 'rejected' } | { kind: 'quote'; quote: GatewayQuote } | { kind: 'paid'; orderId: string } | { kind: 'redirect'; url: string } | { kind: 'failed'; message: string };
export function createGatewayService(repository: GatewayRepository, storage: CheckoutStorage, newId: () => string) {
  return {
    async step(ownerId: string, selection: CheckoutSelection, confirmed: GatewayQuote | null, isCurrent: () => boolean): Promise<Outcome> {
      if (!ownerId) throw Error('Authentication required');
      if (!isCurrent()) return { kind: 'stale' };
      const serialized = JSON.stringify(selection), storageKey = 'trusted-checkout:' + ownerId;
      const raw = storage.getItem(storageKey), saved = raw ? JSON.parse(raw) : null;
      if (saved?.selection === serialized && !validWalletId(saved.key)) throw Error('Invalid saved checkout');
      const operation = saved?.selection === serialized ? { selection: serialized, key: saved.key as string } : { selection: serialized, key: newId() };
      storage.setItem(storageKey, JSON.stringify(operation));
      const connection = await repository.connect(ownerId);
      if (!isCurrent()) return { kind: 'stale' };
      const proof = confirmed?.selection === serialized ? confirmed : null;
      const response = await connection.post(proof ? '/api/bitpay/checkout' : '/api/bitpay/checkout/quote', { idempotencyKey: operation.key, selection, ...(proof ? { quote: proof.quote } : {}) });
      if (!isCurrent()) return { kind: 'stale' };
      const result = response.result;
      if (!response.ok) {
        if (result.code === 'CHECKOUT_EXPIRED') {
          const current = JSON.parse(storage.getItem(storageKey) || 'null');
          if (current?.key === operation.key && current.selection === serialized) storage.removeItem(storageKey);
          return { kind: 'expired' };
        }
        return { kind: result.code === 'PENDING_ORDER_LIMIT' ? 'limit' : 'rejected' };
      }
      if (!proof) return { kind: 'quote', quote: gatewayQuote(result, serialized) };
      if (!validWalletId(result.orderId)) throw Error('Missing trusted order');
      const current = JSON.parse(storage.getItem(storageKey) || 'null');
      if (current?.key !== operation.key || current.selection !== serialized) return { kind: 'stale' };
      storage.setItem(storageKey, JSON.stringify({ ...operation, orderId: result.orderId }));
      const init = await connection.post('/api/bitpay/init', { orderId: result.orderId });
      if (!isCurrent()) return { kind: 'stale' };
      if (init.ok && init.result.success === true) return { kind: 'paid', orderId: result.orderId };
      if (init.result.code === 'PAYMENT_AMBIGUOUS') return { kind: 'ambiguous' };
      if (!init.ok || init.result.error || !init.result.redirectUrl) return { kind: 'failed', message: init.result.error || (!init.ok ? 'Fetch error' : 'مشکلی در اتصال به درگاه پرداخت رخ داد.') };
      return { kind: 'redirect', url: safeTopupRedirect(init.result.redirectUrl) };
    },
  };
}
