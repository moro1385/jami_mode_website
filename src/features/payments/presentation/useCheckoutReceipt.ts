import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { useCheckoutStore } from '@/stores/checkoutStore';
import { checkoutReceipts } from '../payments';
import { validOrderId } from '../domain/receipt';
type ReceiptState = 'loading' | 'paid' | 'pending' | 'unavailable';
export function useCheckoutReceipt() {
  const [params] = useSearchParams();
  const orderId = params.get('order');
  const userId = useAuthStore(s => s.user?.id);
  const [state, setState] = useState<ReceiptState>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    setState('loading');
    async function check() {
      try {
        if (!validOrderId(orderId) || !userId) throw new Error('Invalid receipt');
        const result = await checkoutReceipts.read(userId, orderId, controller.signal);
        if (!active || controller.signal.aborted || useAuthStore.getState().user?.id !== userId) return;
        if (result.paid) {
          if (checkoutReceipts.consume(userId, orderId, useCartStore.getState().items)) {
            useCartStore.getState().clearCart();
            useCheckoutStore.getState().clearCheckout();
          }
          setState('paid');
        } else setState('pending');
      } catch { if (active) setState('unavailable'); }
      finally { clearTimeout(timer); }
    }
    controller.signal.addEventListener('abort', () => { if (active) setState('unavailable'); }, { once: true });
    void check();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [orderId, userId, retry]);
  return { state, orderId, retry: () => setRetry(n => n + 1) };
}
