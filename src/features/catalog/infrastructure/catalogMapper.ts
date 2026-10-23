import { CURRENCY_CODE, type CatalogProduct, type CatalogVariant } from "../domain/catalog";

export type CatalogRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  is_active: boolean;
  is_out_of_stock: boolean;
  is_featured: boolean;
  is_new: boolean;
  images: string[] | null;
  created_at: string;
  tags: string[] | null;
  department: string | null;
  category: string | null;
  brand: string[] | null;
  pattern: string | null;
  type: string[] | null;
  sizes: string[] | null;
  colors: string[] | null;
  categories: { id: string; name: string; slug: string } | null;
  product_images: Array<{ id: string; image_url: string; alt_text: string | null; sort_order: number }> | null;
  product_variants: Array<{
    id: string;
    size: string | null;
    color: string | null;
    sku: string | null;
    price: number | null;
    stock_quantity: number;
  }> | null;
};

/* ---------------- Mapping ---------------- */

function money(amount: number | null | undefined) {
  return { amount: String(amount ?? 0), currencyCode: CURRENCY_CODE };
}

export function mapCatalogProduct(row: CatalogRow): CatalogProduct {
  const images = row.images?.length
    ? row.images.map(url => ({ node: { url, altText: null } }))
    : (row.product_images ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ node: { url: i.image_url, altText: i.alt_text } }));


  const options: Array<{ name: string; values: string[] }> = [];
  if (row.sizes && row.sizes.length > 0) {
    options.push({ name: "Size", values: row.sizes });
  }
  if (row.colors && row.colors.length > 0) {
    options.push({ name: "Color", values: row.colors });
  }

  // Preserve the current storefront contract. Real variant/inventory changes belong to Phase 2.
  const variants: CatalogVariant[] = [{
      id: row.id,
      title: "Default",
      price: money(row.price),
      availableForSale: !row.is_out_of_stock,
      selectedOptions: [],
  }];

  const minPrice = row.price ?? 0;


  return {
    node: {
      id: row.id,
      title: row.name,
      description: row.description ?? "",
      handle: row.slug,
      productType: row.categories?.name ?? "",
      tags: [...(row.tags || []), ...(row.categories?.slug ? [row.categories.slug] : [])],
      priceRange: { minVariantPrice: money(Number.isFinite(minPrice) ? minPrice : row.price ?? 0) },
      images: { edges: images },
      variants: { edges: variants.map((node) => ({ node })) },
      options,
      type: row.type || [],
      sizes: row.sizes || [],
      colors: row.colors || [],
      department: row.department || "",
      category: row.category || "",
      brand: row.brand || [],
      pattern: row.pattern || "",
      createdAt: row.created_at || "",
    },
  };
}
