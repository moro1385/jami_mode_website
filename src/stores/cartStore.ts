import { browserStorageKey } from '../../config/supabase-public.js';
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { addCartItem, updateCartQuantity, removeCartItem, parseCartItems, type CartItem } from '@/features/cart/domain/cart';
export type { CartItem } from '@/features/cart/domain/cart';

interface CartStore {
  items: CartItem[];
  ownerId: string | null;
  bindOwner: (ownerId: string) => void;
  resetOwner: () => void;
  addItem: (item: Omit<CartItem, "id">) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  setItems: (items: CartItem[]) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [], ownerId: null,
      bindOwner: ownerId => set(state => ({ ownerId, items: state.ownerId && state.ownerId !== ownerId ? [] : state.items })),
      resetOwner: () => set({ items: [], ownerId: null }),

      addItem: (item) => set(state => ({ items: addCartItem(state.items, item) })),
      updateQuantity: (id, quantity) => set(state => ({ items: updateCartQuantity(state.items, id, quantity) })),
      removeItem: (id) => set(state => ({ items: removeCartItem(state.items, id) })),

      clearCart: () => set({ items: [] }),

      setItems: (items) => set({ items }),
    }),
    {
      name: browserStorageKey("storefront-cart", import.meta.env.MODE),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, ownerId: state.ownerId }),
      merge: (saved, current) => {
        const persisted = saved as { items?: unknown; ownerId?: unknown } | undefined;
        const ownerId = typeof persisted?.ownerId === 'string' ? persisted.ownerId : null;
        let identity: string | undefined;
        try { identity = JSON.parse(localStorage.getItem(browserStorageKey('jamimode-auth', import.meta.env.MODE)) ?? 'null')?.state?.user?.id; } catch { /* Hide an owned cache without a matching account. */ }
        if (ownerId && ownerId !== identity) return current;
        return { ...current, ownerId, items: parseCartItems(persisted?.items ?? []) };
      },
    }
  )
);
