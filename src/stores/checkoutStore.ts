import { browserStorageKey } from '../../config/supabase-public.js';
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Address } from "@/types/auth";

interface CheckoutStore {
  selectedAddress: Address | null;
  shippingMethod: string | null;
  shippingCost: number;
  setAddress: (address: Address | null) => void;
  setShippingMethod: (method: string, cost: number) => void;
  clearCheckout: () => void;
}

export const useCheckoutStore = create<CheckoutStore>()(
  persist(
    (set) => ({
      selectedAddress: null,
      shippingMethod: null,
      shippingCost: 0,
      setAddress: (address) => set({ selectedAddress: address }),
      setShippingMethod: (method, cost) => set({ shippingMethod: method, shippingCost: cost }),
      clearCheckout: () => set({ selectedAddress: null, shippingMethod: null, shippingCost: 0 }),
    }),
    {
      name: browserStorageKey("checkout-storage", import.meta.env.MODE),
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
