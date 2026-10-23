import { catalogQueryKeys, catalogReadRetry } from './queryKeys';
import { useQuery } from "@tanstack/react-query";
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
