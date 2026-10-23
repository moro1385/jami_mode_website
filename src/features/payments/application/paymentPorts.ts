import type { PaymentResult } from '../domain/wallet';
export interface PaymentTransport {
  request(path: string, ownerId: string, body?: object, signal?: AbortSignal): Promise<PaymentResult>;
  verify(kind: 'order' | 'wallet', body: Record<string, string | null>): Promise<{ ok: boolean; result: PaymentResult }>;
}
export interface ReceiptStorage { getItem(key: string): string | null; removeItem(key: string): void; }
