import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useProduct, useProducts } from "@/hooks/useProducts";
import { formatPrice, productImage, type CatalogProduct } from "@/services/products";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import QuantitySelector from "@/components/QuantitySelector";
import ProductCard from "@/components/ProductCard";
import DynamicSizeGuide from "@/components/DynamicSizeGuide";
import { cn } from "@/lib/utils";
import { colorNames, colorCodes } from "@/lib/translations";
import SEO from "@/components/SEO";
import { Helmet } from "react-helmet-async";

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug);
  const { data: allProducts } = useProducts();
  const addItem = useCartStore((s) => s.addItem);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string>>({});

  const variants = product?.node.variants.edges.map((e) => e.node) ?? [];
  const options = product?.node.options ?? [];

  const activeOptions = useMemo(() => {
    const result: Record<string, string> = {};
    options.forEach((o) => {
      result[o.name] = selected[o.name] ?? o.values[0];
    });
    return result;
  }, [options, selected]);

  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return undefined;
    return variants[0];
  }, [variants]);

  const related = useMemo(() => {
    if (!allProducts || !product) return [] as CatalogProduct[];
    return allProducts
      .filter(
        (p) =>
          p.node.handle !== product.node.handle &&
          p.node.productType === product.node.productType
      )
      .slice(0, 3);
  }, [allProducts, product]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product) return <Navigate to="/shop" replace />;

  const isSoldOut = !selectedVariant?.availableForSale;
  const price = selectedVariant?.price ?? product.node.priceRange.minVariantPrice;

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      toast.error("نیاز به ورود", { description: "برای افزودن محصول به سبد خرید، لطفاً ابتدا وارد حساب کاربری خود شوید." });
      return;
    }
    if (isSoldOut) return;

    addItem({
      productId: product.node.id,
      productTitle: product.node.title,
      productHandle: product.node.handle,
      image: productImage(product),
      price,
      quantity,
selectedSize: activeOptions["Size"] ?? null,
      selectedColor: activeOptions["Color"] ? (colorNames[activeOptions["Color"]] || activeOptions["Color"]) : null,
    });
    toast.success("محصول به سبد خرید اضافه شد");
    setQuantity(1);
  };

  const productSchema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.node.title,
    "description": product.node.description,
    "image": [productImage(product)],
    "offers": {
      "@type": "Offer",
      "priceCurrency": "IRR",
      "price": product.node.priceRange.minVariantPrice.amount,
      "availability": "https://schema.org/InStock",
      "url": window.location.href
    }
  };

  return (
    <>
      <SEO
        title={product.node.title}
        description={product.node.description ? (product.node.description.length > 155 ? product.node.description.substring(0, 155) + "..." : product.node.description) : "خرید از جامی مد"}
        image={productImage(product)}
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(productSchema)}
        </script>
      </Helmet>
      <section className="max-w-6xl mx-auto px-6 py-8">
        <nav className="text-sm text-muted-foreground mb-6">
          <Link to="/shop" className="hover:text-foreground transition-colors">فروشگاه</Link>
          <span className="mx-2">›</span>
          <span className="text-foreground">{product.node.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          <div className="flex flex-col gap-4">
            <div className="w-full aspect-[4/5] bg-warm-bg overflow-hidden relative rounded-2xl">
              <div className="w-full h-full overflow-hidden rounded-2xl relative">
                {isSoldOut && (
                  <span className="absolute top-4 right-4 bg-white/90 text-red-600 text-sm font-bold px-3 py-1 rounded-md z-10">
                    ناموجود
                  </span>
                )}
                <img
                  src={product.node.images.edges[0]?.node.url || "/placeholder.svg"}
                  alt={product.node.title}
                  className={cn("w-full h-full object-cover absolute top-0 left-0 hover:scale-110 transition-transform duration-500", isSoldOut && "grayscale opacity-75")}
                  id="main-product-image"
                  loading="lazy"
                />
              </div>
            </div>
            {product.node.images?.edges && product.node.images.edges.length > 1 && (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
                {product.node.images.edges.map((img, idx) => (
                  <button
                    key={idx}
                    className="flex-shrink-0 w-24 h-24 border focus:outline-none focus:ring-2 focus:ring-foreground snap-start bg-warm-bg rounded-2xl overflow-hidden"
                    onClick={() => {
                      const mainImg = document.getElementById('main-product-image');
                      if (mainImg) (mainImg as HTMLImageElement).src = img.node?.url;
                    }}
                  >
                    <img src={img.node?.url} className="w-full h-full object-cover" alt={`${product.node.title} - تصویر ${idx + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              {product.node.title}
            </h1>
            <p className="text-2xl font-bold text-foreground mb-6">
              {formatPrice(price.amount, price.currencyCode)}
            </p>
            {product.node.description && (
              <p className="text-base leading-relaxed text-muted-foreground mb-8">
                {product.node.description}
              </p>
            )}

            {options
              .filter((o) => o.name !== "Title")
              .map((option) => (
                <div key={option.name} className="mb-6">
                  <p className="text-xs text-muted-foreground mb-2">
                    {option.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((value) => (
                      <button
                        key={value}
                        onClick={() => setSelected((prev) => ({ ...prev, [option.name]: value }))}
                        className={cn(
                          "px-4 py-2 text-sm border transition-colors rounded-full flex items-center justify-center",
                          activeOptions[option.name] === value
                            ? "border-foreground text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {option.name === "Color" ? (
                          <>
                            <span
                              className="inline-block w-3 h-3 rounded-full border border-black/10 ml-2"
                              style={{ background: colorCodes[value] || value }}
                            />
                            <span>{colorNames[value] || value}</span>
                          </>
                        ) : (
                          value
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

            {!isSoldOut ? (
              <div className="flex items-stretch gap-3">
                <QuantitySelector quantity={quantity} onChange={setQuantity} />
                <button
                  onClick={handleAddToCart}
                  className="flex-1 py-3 bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center rounded-full"
                >
                  {"افزودن به سبد خرید"}
                </button>
              </div>
            ) : (
              <button
                disabled
                className="w-full py-3 bg-muted text-muted-foreground text-sm font-medium cursor-not-allowed rounded-full"
              >
                ناموجود
              </button>
            )}

            <DynamicSizeGuide department={product.node.department} category={product.node.category} />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-light text-foreground mb-8">شاید این‌ها را هم دوست داشته باشید</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {related.map((p) => (
              <ProductCard key={p.node.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
