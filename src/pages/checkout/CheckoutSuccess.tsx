import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, CircleAlert } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { useCheckoutStore } from "@/stores/checkoutStore";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { consumeCheckoutReceipt, validOrderId } from "@/lib/checkoutReceipt";
type ReceiptState = 'loading' | 'paid' | 'pending' | 'unavailable';
export default function CheckoutSuccess() {
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
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session || data.session.user.id !== userId) throw new Error('Sign in');
        const response = await fetch('/api/bitpay/orders/' + orderId + '/status', {
          headers: { Authorization: 'Bearer ' + data.session.access_token },
          cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || result.orderId !== orderId || typeof result.paid !== 'boolean') throw new Error('Unavailable');
        if (!active || controller.signal.aborted || useAuthStore.getState().user?.id !== userId) return;
        if (result.paid) {
          if (consumeCheckoutReceipt(userId, orderId, useCartStore.getState().items)) {
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
  return (
    <div className="max-w-4xl mx-auto px-6 py-24 min-h-[60vh] flex flex-col items-center justify-center text-center">
      {state === 'loading' ? <Loader2 className="w-20 h-20 animate-spin mb-6" /> : state === 'paid'
        ? <CheckCircle2 className="w-20 h-20 text-green-500 mb-6" /> : <CircleAlert className="w-20 h-20 mb-6" />}
      <h1 className="text-3xl font-medium mb-4">{state === 'paid' ? 'پرداخت با موفقیت انجام شد'
        : state === 'loading' ? 'در حال بررسی وضعیت سفارش...'
        : state === 'pending' ? 'پرداخت این سفارش هنوز تأیید نشده است' : 'وضعیت پرداخت قابل بررسی نیست'}</h1>
      {state !== 'paid' && state !== 'loading' && <p className="mb-6">سبد خرید شما حفظ شده است. اگر وجه کسر شده، پیش از پرداخت دوباره وضعیت سفارش را پیگیری کنید.</p>}
      {validOrderId(orderId) && <p className="text-muted-foreground mb-8">شماره سفارش: <span dir="ltr">{orderId}</span></p>}
      {(state === 'pending' || state === 'unavailable') && <button onClick={() => setRetry(n => n + 1)} className="mb-6">بررسی دوباره وضعیت</button>}
      <Link to="/account/orders" className="h-12 px-8 bg-foreground text-background flex items-center rounded-full">مشاهده سفارشات من</Link>
    </div>
  );
}
