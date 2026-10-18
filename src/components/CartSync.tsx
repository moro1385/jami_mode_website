import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { supabase } from "@/integrations/supabase/client";
import { flushCartToServer, parseCartItems } from "@/lib/cartSync";

export default function CartSync() {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = !!(session && user);
  const userId = user?.id;

  const previousAuthRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to keep track of if we're currently fetching to avoid race conditions
  const isFetchingRef = useRef(false);

  // Sync on auth change
  useEffect(() => {
    const wasAuthenticated = previousAuthRef.current;
    previousAuthRef.current = isAuthenticated;

    const handleAuthChange = async () => {
      // Transition from unauthenticated to authenticated
      if (!wasAuthenticated && isAuthenticated && userId) {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        try {
          const { data, error } = await supabase
            .from("carts")
            .select("items")
            .eq("user_id", userId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching server cart:", error);
            return;
          }

          const serverItems = parseCartItems(data?.items);

          if (serverItems.length > 0) {
            // REPLACE WITH SERVER ITEMS
            useCartStore.getState().setItems(serverItems);
          }
          // If only local has items, we do nothing to local items,
          // they will be synced up in the subscription useEffect.
        } finally {
          isFetchingRef.current = false;
        }
      }
    };

    handleAuthChange();
  }, [isAuthenticated, userId]);

  const currentItems = useCartStore((s) => s.items);

  // Sync to server when items change
  useEffect(() => {
    if (isAuthenticated && userId) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        // Only sync if not currently actively handling initial fetch/merge
        if (isFetchingRef.current) return;

        const freshUserId = useAuthStore.getState().user?.id;
        const freshIsAuthenticated = useAuthStore.getState().isAuthenticated();

        if (freshIsAuthenticated && freshUserId) {
          await flushCartToServer(freshUserId);
        }
      }, 600);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentItems, isAuthenticated, userId]);

  return null;
}
