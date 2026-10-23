import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { CatalogProduct } from '../domain/catalog';
import type { CatalogReadOptions, CatalogRepository } from '../application/catalogRepository';
import { mapCatalogProduct, type CatalogRow } from './catalogMapper';
const PRODUCT_SELECT = `
  id, name, slug, description, price, is_active, is_out_of_stock, is_featured, is_new, images, created_at, tags, department, category, brand, pattern, type, sizes, colors,
  categories:category_id ( id, name, slug ),
  product_images ( id, image_url, alt_text, sort_order ),
  product_variants ( id, size, color, sku, price, stock_quantity )
`;


export function createSupabaseCatalogRepository(client: Pick<SupabaseClient<Database>, 'from'>): CatalogRepository {
  async function findActive(options: CatalogReadOptions = {}): Promise<CatalogProduct[]> {
    const { limit = 100, featured, newest, categorySlug, department, category } = options;

    let query = client
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (featured) query = query.eq("is_featured", true);
    if (newest) query = query.eq("is_new", true);

    if (categorySlug) {
      const { data: category, error: categoryError } = await client
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .maybeSingle();
      if (categoryError) throw categoryError;
      if (!category) return [];
      query = query.eq("category_id", category.id);
    }

    if (department) query = query.ilike("department", department);
    if (category) query = query.ilike("category", category);

    const { data, error } = await query;
    if (error) throw error;

    return ((data ?? []) as unknown as CatalogRow[]).map(mapCatalogProduct);
  }

  async function findActiveBySlug(slug: string): Promise<CatalogProduct | null> {
    const { data, error } = await client
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data ? mapCatalogProduct(data as unknown as CatalogRow) : null;
  }

  async function findImages(productId: string) {
    const { data, error } = await client
      .from("product_images")
      .select("id, image_url, alt_text, sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async function findVariants(productId: string) {
    const { data, error } = await client
      .from("product_variants")
      .select("id, size, color, sku, price, stock_quantity")
      .eq("product_id", productId);
    if (error) throw error;
    return data ?? [];
  }

  async function findCategories() {
    const { data, error } = await client
      .from("categories")
      .select("id, name, slug, description, image_url")
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }


  return { findActive, findActiveBySlug, findImages, findVariants, findCategories };
}
