import { CatalogReadError } from '@/features/catalog/presentation/CatalogReadError';
import { Loader2 } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { useProducts } from "@/hooks/useProducts";


export default function CoreCollection() {
  const { data: products, isLoading, error, refetch, isFetching } = useProducts();

  return (
    <>
      <section className="relative w-full h-[60vh]">
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="text-center text-white">
            <p className="text-sm uppercase tracking-widest mb-3">Explore</p>
            <h1 className="text-4xl md:text-5xl font-light">The Sock Collection</h1>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-light text-foreground mb-6">
          Crew, quarter and ankle — built for every day.
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground mb-6">
          Athletic, terry-cushioned and wool socks in cotton, bamboo fiber and nano-fabric. Men's
          styles come in a standard free size (EU 40–44), women's in EU 36–40.
        </p>
        <p className="text-base leading-relaxed text-muted-foreground">
          Choose solid, multicolored or patterned finishes to match how you wear them.
        </p>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? <CatalogReadError retry={refetch} busy={isFetching} /> : !products || products.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-16">محصولی یافت نشد</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map((product) => (
              <ProductCard key={product.node.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
