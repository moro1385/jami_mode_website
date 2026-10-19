import { useState, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { ChevronRight, CreditCard, Wallet, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { useCheckoutStore } from "@/stores/checkoutStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function CheckoutPayment() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const rawItems = useCartStore((s) => s.items);

  const selectedAddress = useCheckoutStore((s) => s.selectedAddress);
  const shippingMethod = useCheckoutStore((s) => s.shippingMethod);
  const shippingCost = useCheckoutStore((s) => s.shippingCost);

  const items = rawItems || [];

  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<{ quote: string; total: number; shipping: number; selection: string } | null>(null);
  const requestRef = useRef<{ selection: string; key: string } | null>(null);

  // If we arrived here without an address/shipping selected, kick back to step 1
  if (!selectedAddress || !shippingMethod || !items || items.length === 0) {
    return <Navigate to="/checkout" replace />;
  }

  const subtotal = items.reduce((sum, i) => sum + parseFloat(i.price.amount) * i.quantity, 0);
  const finalTotal = quote?.total ?? subtotal + shippingCost;
  const walletBalance = user?.wallet.balance ?? 0;

  const handleGatewayOrder = async () => {
    if (!user || busy) return;

    setBusy(true);
    try {
      const selection = {
        addressId: selectedAddress.id, shippingOption: shippingMethod,
        items: items.map(item => ({ productId: item.productId, quantity: item.quantity,
          size: item.selectedSize, color: item.selectedColor })),
      };
      const serialized = JSON.stringify(selection);
      // Persist the key before the first request; retries/reloads reuse it.
      const storageKey = 'trusted-checkout:' + user.id;
      if (!requestRef.current || requestRef.current.selection !== serialized) {
        const saved = sessionStorage.getItem(storageKey);
        const parsed: unknown = saved ? JSON.parse(saved) : null;
        requestRef.current = typeof parsed === 'object' && parsed !== null && 'selection' in parsed
          && parsed.selection === serialized && 'key' in parsed && typeof parsed.key === 'string'
          ? { selection: serialized, key: parsed.key } : { selection: serialized, key: crypto.randomUUID() };
        sessionStorage.setItem(storageKey, JSON.stringify(requestRef.current));
      }
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Authentication required');
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionData.session.access_token };
      const confirmedQuote = quote?.selection === serialized ? quote : null;
      const checkoutResponse = await fetch(confirmedQuote ? '/api/bitpay/checkout' : '/api/bitpay/checkout/quote', {
        method: 'POST', headers,
        body: JSON.stringify({ idempotencyKey: requestRef.current.key, selection,
          ...(confirmedQuote ? { quote: confirmedQuote.quote } : {}) }),
      });
      const result = await checkoutResponse.json();
      if (!checkoutResponse.ok) {
        setQuote(null);
        if (result.code === 'CHECKOUT_EXPIRED') {
          requestRef.current = null; sessionStorage.removeItem(storageKey);
          toast.info('مهلت سفارش قبلی تمام شده است. مبلغ و موجودی را دوباره بررسی کنید.'); return;
        }
        if (result.code === 'PENDING_ORDER_LIMIT') {
          toast.error('چند سفارش پرداخت‌نشده دارید. ابتدا وضعیت سفارش‌های قبلی را پیگیری کنید.',
            { action: { label: 'سفارش‌های من', onClick: () => navigate('/account/orders') } }); return;
        }
        throw new Error(result.error || 'Checkout rejected');
      }
      if (!confirmedQuote) {
        if (typeof result.quote !== 'string' || !Number.isSafeInteger(result.total) || !Number.isSafeInteger(result.shipping)) throw new Error('Invalid quote');
        setQuote({ quote: result.quote, total: result.total, shipping: result.shipping, selection: serialized });
        return;
      }
      if (typeof result.orderId !== 'string') throw new Error('Missing trusted order');
      sessionStorage.setItem(storageKey, JSON.stringify({ ...requestRef.current, orderId: result.orderId }));
      const response = await fetch("/api/bitpay/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session?.access_token}`
        },
        body: JSON.stringify({ orderId: result.orderId })
      });
      const bitpayData = await response.json();
      if (response.ok && bitpayData.success === true) {
        navigate(`/checkout/success?order=${encodeURIComponent(result.orderId)}`);
        return;
      }
      if (bitpayData.code === 'PAYMENT_AMBIGUOUS') {
        toast.error('وضعیت پرداخت هنوز مشخص نیست. اگر وجه کسر شده، پیش از پرداخت دوباره سفارش را پیگیری کنید.',
          { action: { label: 'پیگیری سفارش', onClick: () => navigate('/account/orders') } }); return;
      }
      const bitpayError = !response.ok ? new Error(bitpayData.error || 'Fetch error') : null;

      if (bitpayError || bitpayData?.error || !bitpayData?.redirectUrl) {
        const errMsg = bitpayData?.error || bitpayError?.message || "مشکلی در اتصال به درگاه پرداخت رخ داد.";
        toast.error(errMsg);
        setBusy(false);
        return;
      }

      // Redirect to Bitpay
      window.location.href = bitpayData.redirectUrl;
      return; // Halt further execution, user is redirecting

    } catch (err) {
      console.error("Order error", err);
      toast.error("ثبت سفارش با شکست مواجه شد. لطفاً دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-24">
      <h1 className="text-2xl font-medium text-foreground mb-8">تسویه حساب</h1>

      <div className="flex items-center gap-2 mb-12 text-sm text-muted-foreground">
        <button onClick={() => navigate("/checkout")} className="hover:text-foreground transition-colors">
          ۱. آدرس و ارسال
        </button>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-medium">۲. بازبینی و پرداخت</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-7 space-y-8">
          <section>
            <h2 className="text-lg font-medium text-foreground mb-6">روش پرداخت</h2>

            <div className="space-y-4">
              {/* Wallet Option */}
              <div className="border border-border bg-muted/30 p-6 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5" />
                    <span className="font-medium">پرداخت از کیف پول</span>
                  </div>
                  <span className="text-sm">
                    موجودی: {new Intl.NumberFormat('fa-IR').format(walletBalance)} ریال
                  </span>
                </div>

                <p role="status" className="text-sm text-muted-foreground mb-4">پرداخت از کیف پول موقتاً در دسترس نیست.</p>
                <button disabled className="w-full h-12 bg-muted text-muted-foreground rounded-full">
                  پرداخت از کیف پول (موقتاً غیرفعال)
                </button>
              </div>

              {quote && <p role="status">مبلغ نهایی سرور: {new Intl.NumberFormat('fa-IR').format(quote.total)} ریال. برای تایید این مبلغ و پرداخت دوباره کلیک کنید.</p>}
              {/* Gateway Option */}
              <div className="border border-border p-6 rounded-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <CreditCard className="w-5 h-5" />
                  <span className="font-medium">پرداخت اینترنتی</span>
                </div>

                <button
                  onClick={handleGatewayOrder}
                  disabled={busy}
                  className="w-full h-12 bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 rounded-full"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : quote ? "\u062a\u0627\u06cc\u06cc\u062f \u0645\u0628\u0644\u063a \u0648 \u067e\u0631\u062f\u0627\u062e\u062a \u0627\u0632 \u062f\u0631\u06af\u0627\u0647" : "پرداخت از طریق درگاه"}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-5">
          <div className="bg-muted/30 p-6 border border-border sticky top-24 rounded-2xl">
            <h3 className="text-lg font-medium text-foreground mb-6">خلاصه سفارش</h3>

            <ul className="divide-y divide-border mb-6">
              {items.map((item) => (
                <li key={item.id} className="py-4 flex gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium line-clamp-1">{item.productTitle}</p>
                    <p className="text-xs text-muted-foreground mt-1">تعداد: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-medium whitespace-nowrap">
                    {new Intl.NumberFormat('fa-IR').format(parseFloat(item.price.amount) * item.quantity)} ریال
                  </p>
                </li>
              ))}
            </ul>

            <div className="space-y-3 text-sm pb-6 border-b border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">جمع کل</span>
                <span>{new Intl.NumberFormat('fa-IR').format(quote ? quote.total - quote.shipping : subtotal)} ریال</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ارسال</span>
                <span>{new Intl.NumberFormat('fa-IR').format(quote?.shipping ?? shippingCost)} ریال</span>
              </div>
            </div>

            <div className="flex justify-between items-end pt-6">
              <span className="text-base font-medium">مبلغ نهایی</span>
              <span className="text-xl font-medium">
                {new Intl.NumberFormat('fa-IR').format(finalTotal)} ریال
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
