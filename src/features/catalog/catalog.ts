import { supabase } from '@/integrations/supabase/client';
import { createCatalogService } from './application/catalogService';
import { createSupabaseCatalogRepository } from './infrastructure/supabaseCatalogRepository';
export type { CatalogProduct } from './domain/catalog';

// The composition root is the only catalog module that selects the live client.
export const {
  fetchActiveProducts, fetchFeaturedProducts, fetchNewestProducts, fetchProductsByCategory,
  fetchProductBySlug, fetchProductImages, fetchProductVariants, fetchCategories,
} = createCatalogService(createSupabaseCatalogRepository(supabase));
