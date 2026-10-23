import { CatalogReadError } from '@/features/catalog/presentation/CatalogReadError';
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShopFilters, FilterState } from "@/components/ShopFilters";
import { ShopSort } from "@/components/ShopSort";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import FadeIn from "@/components/FadeIn";
import SEO from "@/components/SEO";

export default function Shop() {
  const [searchParams] = useSearchParams();
  const departmentQuery = searchParams.get("department");
  const categoryQuery = searchParams.get("category");
  const searchQuery = searchParams.get("query");

  const { data: products, isLoading, error, refetch, isFetching } = useProducts({
    department: departmentQuery,
    category: categoryQuery,
    terms: searchQuery ? [searchQuery] : undefined
  });

  const [selectedFilters, setSelectedFilters] = useState<FilterState>({});
  const [sortValue, setSortValue] = useState<string>("newest");

  const handleFilterChange = (categoryId: string, value: string, checked: boolean) => {
    setSelectedFilters((prev) => {
      const currentValues = prev[categoryId] || [];
      if (checked) {
        return { ...prev, [categoryId]: [...currentValues, value] };
      } else {
        return { ...prev, [categoryId]: currentValues.filter((v) => v !== value) };
      }
    });
  };

  let visible = products || [];
  if (selectedFilters.type && selectedFilters.type.length > 0) {
    visible = visible.filter(p => p.node.type?.some(t => selectedFilters.type.includes(t)));
  }
  if (selectedFilters.brand && selectedFilters.brand.length > 0) {
    visible = visible.filter(p => p.node.brand?.some(b => selectedFilters.brand.includes(b)));
  }
  if (selectedFilters.pattern && selectedFilters.pattern.length > 0) {
    visible = visible.filter(p => selectedFilters.pattern.includes(p.node.pattern));
  }
  if (selectedFilters.size && selectedFilters.size.length > 0) {
    visible = visible.filter(p => p.node.sizes?.some(s => selectedFilters.size.includes(s)));
  }

  // Apply sorting after filtering
  visible = [...visible].sort((a, b) => {
    if (sortValue === "newest") {
      return new Date(b.node.createdAt).getTime() - new Date(a.node.createdAt).getTime();
    } else if (sortValue === "price-asc") {
      return parseFloat(a.node.priceRange.minVariantPrice.amount) - parseFloat(b.node.priceRange.minVariantPrice.amount);
    } else if (sortValue === "price-desc") {
      return parseFloat(b.node.priceRange.minVariantPrice.amount) - parseFloat(a.node.priceRange.minVariantPrice.amount);
    }
    return 0;
  });

  const categoryNames: Record<string, string> = {
    "socks": "جوراب",
    "underwear": "لباس زیر",
    "undershirts": "زیرپوش",
    "pants": "شلوار",
    "shorts": "شلوارک",
    "t-shirts": "تیشرت",
    "tank-tops": "تاپ",
    "sets": "ست",
  };

  const departmentNames: Record<string, string> = {
    "men": "مردانه",
    "women": "زنانه",
    "kids": "بچگانه",
  };

  const dynamicTitle = departmentQuery || categoryQuery
    ? `${categoryQuery ? categoryNames[categoryQuery] || categoryQuery : ""} ${departmentQuery ? departmentNames[departmentQuery] || departmentQuery : ""}`.trim()
    : "فروشگاه";

  const dynamicDesc = departmentQuery || categoryQuery
    ? `خرید ${categoryQuery ? categoryNames[categoryQuery] || categoryQuery : "محصولات"} ${departmentQuery ? departmentNames[departmentQuery] || departmentQuery : ""} با بهترین کیفیت از جامی مد.`.trim()
    : "مشاهده تمام محصولات جامی مد";

  return (
    <div className="min-h-screen bg-[hsl(var(--warm-bg))] relative z-0">
      <SEO title={dynamicTitle} description={dynamicDesc} />
      <h1 className="sr-only">
        {departmentQuery || categoryQuery
          ? `${categoryQuery ? categoryNames[categoryQuery] || categoryQuery : ""} ${departmentQuery ? departmentNames[departmentQuery] || departmentQuery : ""}`.trim()
          : "جوراب، لباس زیر، زیرپوش، لباس راحتی و شلوارک"}
      </h1>

      {/* Main Content Layout */}
      <div className="w-full px-6 pt-8 md:pt-12 pb-24">
        <div className="flex flex-col lg:flex-row gap-8">



          {/* Mobile Filter Toggle & Sort */}
          <div className="flex lg:hidden justify-between items-center w-full mb-6">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  فیلتر
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="text-right">فیلتر</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <ShopFilters
                    selectedFilters={selectedFilters}
                    onFilterChange={handleFilterChange}
                    department={departmentQuery}
                    category={categoryQuery}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <ShopSort value={sortValue} onValueChange={setSortValue} />
          </div>

          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0 bg-card border border-border rounded-2xl p-5 shadow-xs lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto overscroll-contain pl-2 [scrollbar-width:thin]">
            <h2 className="text-lg font-semibold mb-4">فیلتر</h2>
            <ShopFilters
              selectedFilters={selectedFilters}
              onFilterChange={handleFilterChange}
              department={departmentQuery}
              category={categoryQuery}
            />
          </aside>

          {/* Main Product Area */}
          <div className="flex-1">
            <div className="hidden lg:flex justify-end mb-6">
              <ShopSort value={sortValue} onValueChange={setSortValue} />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <CatalogReadError retry={refetch} busy={isFetching} />
            ) : visible.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-24">محصولی یافت نشد</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
                {visible.map((product, index) => (
                  <FadeIn key={product.node.id} delay={(index % 10) * 50}>
                    <ProductCard product={product} />
                  </FadeIn>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}