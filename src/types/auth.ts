import type { Address } from '@/features/account/domain/address';
export type { Address } from '@/features/account/domain/address';

export interface WalletTransaction {
  id: string;
  createdAt: string;
  description: string;
  amount: number; // positive = credit, negative = debit
}

import type { AccountOrder as Order } from '@/features/orders/domain/order';
export type { AccountOrder as Order, OrderLine, OrderStatus } from '@/features/orders/domain/order';

export interface User {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  createdAt: string;
  addresses: Address[];
  wallet: { balance: number; currencyCode: string; transactions: WalletTransaction[] };
  orders: Order[];
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}
