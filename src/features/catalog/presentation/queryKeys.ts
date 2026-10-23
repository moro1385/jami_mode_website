// Preserve existing cache identities while making invalidation boundaries explicit.
export const catalogQueryRoots = new Set(['products', 'product']);
export function catalogReadRetry(attempt: number, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST116', '22P02'].includes(String(code))) return false;
  return attempt < 2;
}
export const catalogQueryKeys = {
  products: (department: string | null | undefined, category: string | null | undefined, terms: string[], first: number) => ['products', department, category, terms, first] as const,
  product: (slug?: string) => ['product', slug] as const,
  featured: (first: number) => ['products', 'featured', first] as const,
  category: (slug: string | undefined, first: number) => ['products', 'category', slug, first] as const,
  newest: (first: number) => ['products', 'newest', first] as const,
};
