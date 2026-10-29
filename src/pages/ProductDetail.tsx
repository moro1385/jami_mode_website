import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { CatalogReadError } from '@/features/catalog/presentation/CatalogReadError';
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useProduct, useRelatedProducts } from "@/hooks/useProducts";
import { formatPrice, productImage } from "@/services/products";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import QuantitySelector from "@/components/QuantitySelector";
import ProductCard from "@/components/ProductCard";
import DynamicSizeGuide from "@/components/DynamicSizeGuide";
import { cn } from "@/lib/utils";
import { colorNames, colorCodes } from "@/lib/translations";
import SEO from "@/components/SEO";
import { productJsonLd, productBreadcrumbs, serializeJsonLd } from "../../config/seo.js";
import { Helmet } from "react-helmet-async";

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, error, refetch, isFetching } = useProduct(slug);
  const { data: related = [], error: relatedError, refetch: refetchRelated, isFetching: isFetchingRelated } = useRelatedProducts(product);
  const addItem = useCartStore((s) => s.addItem);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string>>({});

  const variants = useMemo(() => product?.node.variants.edges.map((e) => e.node) ?? [], [product]);
  const options = useMemo(() => product?.node.options ?? [], [product]);

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

  if (isLoading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) return <><SEO title="دریافت اطلاعات محصول موقتاً ممکن نیست" description="دریافت اطلاعات این محصول انجام نشد؛ دوباره تلاش کنید." noindex/><CatalogReadError retry={refetch} busy={isFetching} /></>;

  if (!product) return <>
    <SEO title="محصول پیدا نشد" description="محصول مورد نظر در دسترس نیست. محصولات دیگر را در فروشگاه ببینید." noindex/>
    <section className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h1 className="text-2xl font-bold mb-4">محصول پیدا نشد</h1>
      <p className="text-muted-foreground mb-8">این محصول در دسترس نیست. می‌توانید محصولات دیگر را در فروشگاه ببینید.</p>
      <Link to="/shop" className="underline underline-offset-4">مشاهدهٔ فروشگاه</Link>
    </section>
  </>;

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

  const breadcrumbs = productBreadcrumbs({name:product.node.title,slug:product.node.handle});
  const productSchema = productJsonLd({name:product.node.title,description:product.node.description,
    slug:product.node.handle,image:supabaseAssetUrl(productImage(product)),amount:price.amount,
    currency:price.currencyCode,soldOut:isSoldOut});

  return (
    <>
      <SEO
        title={product.node.title}
        description={product.node.description ? (product.node.description.length > 155 ? product.node.description.substring(0, 155) + "..." : product.node.description) : "خرید از جامی مد"}
        image={supabaseAssetUrl(productImage(product))}
      />
      <Helmet>
        {productSchema && <script id="product-structured-data" type="application/ld+json">
          {serializeJsonLd(productSchema)}
        </script>}
        {breadcrumbs && <script id="product-breadcrumbs" type="application/ld+json">{serializeJsonLd(breadcrumbs)}</script>}
      </Helmet>
      <section className="max-w-6xl mx-auto px-6 py-8">
        <nav aria-label="مسیر راهنما" className="text-sm text-muted-foreground mb-6">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
            {breadcrumbs?.itemListElement.map((crumb,index)=><li key={crumb.position} className="inline-flex items-center gap-2">
              {index>0&&<span aria-hidden="true">›</span>}
              {index===breadcrumbs.itemListElement.length-1
                ?<span aria-current="page" className="text-foreground">{crumb.name}</span>
                :<Link to={new URL(crumb.item).pathname} className="hover:text-foreground transition-colors underline-offset-4 hover:underline">{crumb.name}</Link>}
            </li>)}
          </ol>
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
                  src={supabaseAssetUrl(product.node.images.edges[0]?.node.url || "/placeholder.svg")}
                  alt={product.node.title}
                  className={cn("w-full h-full object-cover absolute top-0 left-0 hover:scale-110 transition-transform duration-500", isSoldOut && "grayscale opacity-75")}
                  id="main-product-image"
                  loading="eager"
                  {...{fetchpriority:"high"}}
                  decoding="async"
                />
              </div>
            </div>
            {product.node.images?.edges && product.node.images.edges.length > 1 && (
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
                {product.node.images.edges.map((img, idx) => (
                  <button
                    key={idx}
                    className="shrink-0 w-24 h-24 border focus:outline-hidden focus:ring-2 focus:ring-foreground snap-start bg-warm-bg rounded-2xl overflow-hidden"
                    onClick={() => {
                      const mainImg = document.getElementById('main-product-image');
                      if (mainImg) (mainImg as HTMLImageElement).src = supabaseAssetUrl(img.node?.url) || "/placeholder.svg";
                    }}
                  >
                    <img src={supabaseAssetUrl(img.node?.url)} className="w-full h-full object-cover" alt={`${product.node.title} - تصویر ${idx + 1}`} loading="lazy" />
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

      {(related.length > 0 || relatedError) && (
        <section aria-labelledby="related-products-title" className="max-w-6xl mx-auto px-6 py-16">
          <h2 id="related-products-title" className="text-2xl font-light text-foreground mb-8">شاید این‌ها را هم دوست داشته باشید</h2>
          {relatedError ? <div role="alert"><p>دریافت پیشنهادها ممکن نیست.</p><button type="button" disabled={isFetchingRelated} onClick={()=>{void refetchRelated();}} className="mt-3 underline underline-offset-4">بررسی دوبارهٔ پیشنهادها</button></div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {related.map((p) => (
              <ProductCard key={p.node.id} product={p} />
            ))}
          </div>}
        </section>
      )}
    </>
  );
}
