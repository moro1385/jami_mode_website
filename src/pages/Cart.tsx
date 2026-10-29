import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { CartSyncNotice } from '@/features/cart/presentation/CartSyncNotice';
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { formatPrice } from "@/services/products";
import QuantitySelector from "@/components/QuantitySelector";
import ProductLink from "@/components/ProductLink";
import SEO from "@/components/SEO";
import { cartSummary } from "@/features/cart/domain/cart";
import { colorNames } from "@/lib/translations";

export default function Cart() {
const navigate = useNavigate();
  const items = useCartStore((s) => s.items) || [];
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const { subtotal, currency } = cartSummary(items);

  const handleCheckout = () => {
    navigate("/checkout");
  };

  if (!items || items.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-24">
        <SEO
          title="سبد خرید"
          description="مشاهده و تکمیل سبد خرید شما در جامی مد."
        />
        <h1 className="text-2xl font-medium text-foreground mb-4">سبد خرید</h1>
        <CartSyncNotice />
        <p className="text-sm text-foreground mb-8">شما هیچ محصولی در سبد خرید خود ندارید.</p>
        <Link
          to="/shop"
          className="inline-block px-8 py-4 bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity rounded-full"
        >
          ادامه خرید
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-24">
      <SEO
        title="سبد خرید"
        description="مشاهده و تکمیل سبد خرید شما در جامی مد."
      />
      <h1 className="text-2xl font-medium text-foreground mb-12">سبد خرید</h1>
      <CartSyncNotice />
      <div className="space-y-8">
        {items.map((item) => (
          <div key={item.id} className="flex gap-6 border-b border-border pb-8">
            <img
              src={supabaseAssetUrl(item.image)}
              alt={item.productTitle}
              className="w-24 h-24 object-cover bg-[hsl(var(--warm-bg))] rounded-2xl"
              loading="lazy"
              width={96}
              height={96}
            />
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-medium text-foreground">
                    <ProductLink slug={item.productHandle} className="hover:underline">
                      {item.productTitle}
                    </ProductLink>
                  </h3>
                  {(item.selectedSize || item.selectedColor) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {[item.selectedSize, item.selectedColor ? (colorNames[item.selectedColor] || item.selectedColor) : null].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatPrice(item.price.amount, item.price.currencyCode)}
                  </p>
                </div>
                <button onClick={() => removeItem(item.id)} aria-label="Remove item">
                  <X className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                </button>
              </div>
              <div className="mt-4">
                <QuantitySelector
                  quantity={item.quantity}
                  onChange={(q) => updateQuantity(item.id, q)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-col items-end gap-4">
        <p className="text-lg text-foreground">
          جمع کل: <span className="font-medium">{formatPrice(subtotal, currency)}</span>
        </p>
        <button
          onClick={handleCheckout}
          className="px-8 py-4 bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2 rounded-full"
        >
          تسویه حساب
        </button>
      </div>
    </div>
  );
}
