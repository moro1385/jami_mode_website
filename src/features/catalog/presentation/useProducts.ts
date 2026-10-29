import { catalogQueryKeys, catalogReadRetry } from './queryKeys';
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  fetchActiveProducts,
  fetchFeaturedProducts,
  fetchNewestProducts,
  fetchProductBySlug,
  fetchProductsByCategory,
  type CatalogProduct,
} from "../catalog";

import { parseLegacyQuery } from "../domain/legacyQuery";
export { parseLegacyQuery } from "../domain/legacyQuery";

/** Drop-in replacement for the previous storefront products hook. */
export function useProducts(
  { department, category, query, terms: initialTerms, first = 100 }:
  { department?: string | null; category?: string | null; query?: string; terms?: string[]; first?: number } = {}
) {
  const terms = initialTerms || parseLegacyQuery(query);

  const result = useQuery<CatalogProduct[]>({
    queryKey: catalogQueryKeys.products(department, category, terms, first),
    queryFn: () => fetchActiveProducts({ limit: first, terms, department: department || undefined, category: category || undefined }),
    staleTime: 60_000,
    retry: catalogReadRetry,
  });

  return { ...result, isEmpty: !result.isLoading && !result.isError && (result.data?.length ?? 0) === 0 };
}

export function useProduct(slug?: string) {
  return useQuery<CatalogProduct | null>({
    queryKey: catalogQueryKeys.product(slug),
    queryFn: () => fetchProductBySlug(slug!),
    enabled: !!slug,
    staleTime: 60_000,
    retry: catalogReadRetry,
  });
}

export function useFeaturedProducts(first = 8) {
  const result = useQuery<CatalogProduct[]>({
    queryKey: catalogQueryKeys.featured(first),
    queryFn: () => fetchFeaturedProducts(first),
    staleTime: 60_000,
    retry: catalogReadRetry,
  });
  return { ...result, isEmpty: !result.isLoading && !result.isError && (result.data?.length ?? 0) === 0 };
}

export function useCategoryProducts(categorySlug?: string, first = 100) {
  const result = useQuery<CatalogProduct[]>({
    queryKey: catalogQueryKeys.category(categorySlug, first),
    queryFn: () => fetchProductsByCategory(categorySlug!, first),
    enabled: !!categorySlug,
    staleTime: 60_000,
    retry: catalogReadRetry,
  });
  return { ...result, isEmpty: !result.isLoading && !result.isError && (result.data?.length ?? 0) === 0 };
}

export function useNewestProducts(first = 8) {
  const result = useQuery<CatalogProduct[]>({
    queryKey: catalogQueryKeys.newest(first),
    queryFn: () => fetchNewestProducts(first),
    staleTime: 60_000,
    retry: catalogReadRetry,
  });
  return { ...result, isEmpty: !result.isLoading && !result.isError && (result.data?.length ?? 0) === 0 };
}

/** Select one rail query without subscribing to the two unused lists. */
export function useProductRail(type: 'featured' | 'newest' | 'query', first = 8, query?: string) {
  const terms = parseLegacyQuery(query);
  const result = useQuery<CatalogProduct[]>({
    queryKey: type === 'featured' ? catalogQueryKeys.featured(first)
      : type === 'newest' ? catalogQueryKeys.newest(first)
      : catalogQueryKeys.products(undefined, undefined, terms, first),
    queryFn: () => type === 'featured' ? fetchFeaturedProducts(first)
      : type === 'newest' ? fetchNewestProducts(first)
      : fetchActiveProducts({limit:first,terms}),
    staleTime: 60_000,
    retry: catalogReadRetry,
  });
  return {...result,isEmpty:!result.isLoading&&!result.isError&&(result.data?.length??0)===0};
}

/** Fixed public collections reuse the normal category caches and denial policy. */
export function useCollectionProducts(categories: readonly string[]) {
  const results = useQueries({queries:categories.map(category=>({
    queryKey:catalogQueryKeys.products(undefined,category,[],100),
    queryFn:()=>fetchActiveProducts({category,limit:100}),
    staleTime:60_000,retry:catalogReadRetry,
  }))});
  const unique = new Map<string,CatalogProduct>();
  for(const result of results)for(const product of result.data??[])unique.set(product.node.id,product);
  const data=[...unique.values()].sort((a,b)=>b.node.createdAt.localeCompare(a.node.createdAt)||a.node.id.localeCompare(b.node.id));
  const error=results.find(result=>result.isError)?.error;
  return {data,error,isLoading:results.some(result=>result.isPending),isFetching:results.some(result=>result.isFetching),refetch:()=>Promise.all(results.map(result=>result.refetch()))};
}

/** Four category candidates leave up to three cards after excluding the current item. */
export function useRelatedProducts(product?: CatalogProduct | null) {
  const category=product?.node.category;
  return useQuery<CatalogProduct[]>({
    queryKey:catalogQueryKeys.products(undefined,category,[],4),
    queryFn:()=>fetchActiveProducts({category:category!,limit:4}),
    enabled:!!category,
    staleTime:60_000,retry:catalogReadRetry,
    select:rows=>rows.filter(row=>row.node.id!==product?.node.id).slice(0,3),
  });
}
