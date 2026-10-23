import { CatalogReadError } from '@/features/catalog/presentation/CatalogReadError';
import { Link } from "react-router-dom";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { useProducts, useFeaturedProducts, useNewestProducts } from "@/hooks/useProducts";
import { useRef, useState, useEffect, useMemo } from "react";

interface ProductRailProps {
  eyebrow: string;
  title: string;
  query?: string;
  type?: 'featured' | 'newest' | 'query';
  count?: number;
  ctaTo?: string;
  ctaLabel?: string;
  className?: string;
}

export default function ProductRail({
  eyebrow,
  title,
  query,
  type = 'query',
  count = 4,
  ctaTo = "/shop",
  ctaLabel,
  className,
}: ProductRailProps) {
  const queryResult = useProducts({ query, first: count });
  const featuredResult = useFeaturedProducts(count);
  const newestResult = useNewestProducts(count);

  const result = type === 'featured' ? featuredResult : type === 'newest' ? newestResult : queryResult;
  const { data: products, isLoading, error, refetch, isFetching } = result;

  const items = useMemo(() => products ?? [], [products]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(true);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      // In RTL, scrollLeft is usually negative or 0 depending on browser.
      // E.g., in Chrome it goes from 0 (rightmost) to negative (leftmost).
      const scrollPos = Math.abs(scrollLeft);
      // The rightmost position (initial in RTL) is 0.
      // The leftmost position is scrollWidth - clientWidth.

      // Can scroll left (towards next items): scrollPos < max scroll
      setCanScrollLeft(scrollPos < scrollWidth - clientWidth - 2);
      // Can scroll right (towards previous items): scrollPos > 0
      setCanScrollRight(scrollPos > 2);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [items]);

  const scroll = (direction: 'next' | 'prev') => {
    if (scrollRef.current) {
      const { clientWidth } = scrollRef.current;
      const scrollAmount = clientWidth * 0.8;
      // 'next' means moving left in RTL (so scrollLeft decreases/becomes more negative)
      // 'prev' means moving right in RTL (so scrollLeft increases/goes towards 0)
      scrollRef.current.scrollBy({
        left: direction === 'next' ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className={className ?? "py-20"}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between gap-6 mb-10">
          <div>
            <p className="text-xs text-muted-foreground mb-3">{eyebrow}</p>
            <h2 className="text-3xl md:text-4xl font-light text-foreground">{title}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex gap-2">
              <button
                onClick={() => scroll('next')}
                disabled={!canScrollLeft}
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="بعدی"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scroll('prev')}
                disabled={!canScrollRight}
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="قبلی"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {ctaLabel && (
              <Link
                to={ctaTo}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                {ctaLabel}
              </Link>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? <CatalogReadError retry={refetch} busy={isFetching} /> : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">محصولی یافت نشد</p>
        ) : (
          <div
            ref={scrollRef}
            onScroll={checkScroll}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6 thin-scrollbar"
          >
            {items.map((product) => (
              <div key={product.node.id} className="snap-start shrink-0 w-[46%] sm:w-[31%] md:w-[24%] lg:w-[19%]">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
