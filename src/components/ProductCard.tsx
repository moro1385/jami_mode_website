import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import ProductLink from "./ProductLink";
import { formatPrice, productImage, type CatalogProduct } from "@/services/products";
import { categoryNames } from "@/lib/translations";
import { cn } from "@/lib/utils";

export default function ProductCard({ product }: { product: CatalogProduct }) {
  const { title, handle, productType, priceRange, variants } = product.node;
  const inStock = variants.edges.some((v) => v.node.availableForSale);
  const price = priceRange.minVariantPrice;

  return (
    <ProductLink slug={handle} fallback="div" className="group relative block">
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(var(--warm-bg))]">
        {!inStock && (
          <span className="absolute top-2 right-2 bg-white/90 text-red-600 text-xs font-bold px-2 py-1 rounded-md z-10">
            ناموجود
          </span>
        )}
        <img
          src={supabaseAssetUrl(productImage(product))}
          alt={title}
          className={cn("w-full aspect-[4/5] object-cover transition-transform duration-500 group-hover:scale-105", !inStock && "grayscale opacity-75")}
          loading="lazy"
          decoding="async"
          width={400}
          height={500}
        />
      </div>
      {product.node.images?.edges && product.node.images.edges.length > 1 && (
        <div className="flex gap-2 mt-2">
          {product.node.images.edges.slice(0, 3).map((edge, index) => {
            const isLast = index === 2;
            const hasMore = product.node.images.edges.length > 3;
            return (
              <div key={index} className="relative w-12 h-12 rounded-lg overflow-hidden bg-[hsl(var(--warm-bg))] border border-border/50">
                <img
                  src={supabaseAssetUrl(edge.node?.url)}
                  alt={`${title} تصویر ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
          decoding="async"
                  width={48}
                  height={48}
                />
                {isLast && hasMore && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-xs font-medium">+{product.node.images.edges.length - 3}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-medium text-foreground">{title}</h3>
        </div>
        {productType && (
          <p className="text-xs text-muted-foreground mt-1">{categoryNames[productType.toLowerCase()] || productType}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-foreground">
            {formatPrice(price.amount, price.currencyCode)}
          </span>
        </div>
      </div>
    </ProductLink>
  );
}
