import { useNavigate, Navigate } from "react-router-dom";
import { ChevronRight, CreditCard, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { useCheckoutStore } from "@/stores/checkoutStore";
import { checkoutSelection } from "@/features/payments/domain/checkout";
import { useGatewayCheckout } from "@/features/payments/presentation/useGatewayCheckout";
import WalletCheckout from "@/components/checkout/WalletCheckout";

export default function CheckoutPayment() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const rawItems = useCartStore((s) => s.items);

  const selectedAddress = useCheckoutStore((s) => s.selectedAddress);
  const shippingMethod = useCheckoutStore((s) => s.shippingMethod);
  const shippingCost = useCheckoutStore((s) => s.shippingCost);

  const items = rawItems || [];

  const selection = checkoutSelection(selectedAddress?.id ?? '', shippingMethod ?? '', items);
  const { busy, quote, handleGatewayOrder } = useGatewayCheckout(user?.id, selection);

  // If we arrived here without an address/shipping selected, kick back to step 1
  if (!selectedAddress || !shippingMethod || !items || items.length === 0) {
    return <Navigate to="/checkout" replace />;
  }

  const subtotal = items.reduce((sum, i) => sum + parseFloat(i.price.amount) * i.quantity, 0);
  const finalTotal = quote?.total ?? subtotal + shippingCost;

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
              <WalletCheckout key={user?.id} selection={selection} />

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
