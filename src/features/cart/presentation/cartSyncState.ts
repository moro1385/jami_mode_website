import { create } from 'zustand';
import type { CartSyncStatus } from '../application/cartSyncController';
export const useCartSyncState = create<{ ownerId?: string; status: CartSyncStatus; retry?: () => void; unavailable?: boolean }>(() => ({ status: 'loading' }));
