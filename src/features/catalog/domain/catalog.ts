import type { DisplayMoney } from '@/shared/domain/commerce';
// Compatibility display variant; id must not be treated as a persisted inventory variant ID.
export interface CatalogVariant {
  id: string;
  title: string;
  price: DisplayMoney;
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface CatalogProduct {
  node: {
    id: string;
    title: string;
    description: string;
    handle: string;
    productType: string;
    tags: string[];
    priceRange: { minVariantPrice: DisplayMoney };
    images: { edges: Array<{ node: { url: string; altText: string | null } }> };
    variants: { edges: Array<{ node: CatalogVariant }> };
    options: Array<{ name: string; values: string[] }>;
    type: string[];
    sizes: string[];
    colors: string[];
    department: string;
    category: string;
    brand: string[];
    pattern: string;
    createdAt: string;
  };
}

export const CURRENCY_CODE = "IRR";

export interface ProductQueryOptions {
  limit?: number;
  featured?: boolean;
  newest?: boolean;
  categorySlug?: string;
  department?: string;
  category?: string;
  /** Free-text terms matched against product name / category name or slug */
  terms?: string[];
}


export interface CatalogImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
}
export interface CatalogStoredVariant {
  id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  price: number | null;
  stock_quantity: number;
}
export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
}
