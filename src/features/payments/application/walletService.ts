import { validateWalletSummary, type WalletEntry } from '../domain/wallet';
import type { PaymentTransport } from './paymentPorts';
export function createWalletService(transport: PaymentTransport) {
  return {
    request: (path: string, ownerId: string, body?: object, signal?: AbortSignal) => transport.request(path, ownerId, body, signal),
    async summary(ownerId: string, cursor?: WalletEntry, signal?: AbortSignal) {
      const query = cursor ? '?' + new URLSearchParams({ before: cursor.createdAt, beforeId: cursor.id }) : '';
      return validateWalletSummary(await transport.request('/api/wallet/summary' + query, ownerId, undefined, signal));
    },
  };
}
