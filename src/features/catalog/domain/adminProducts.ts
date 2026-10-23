import { slugify } from '@/lib/slugify';

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  created_at: string;
  description: string | null;
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  is_out_of_stock: boolean;
  images: string[];
  tags: string[] | null;
  department: string | null;
  category: string | null;
  type: string[] | null;
  brand: string[] | null;
  pattern: string | null;
  sizes: string[] | null;
  colors: string[] | null;
}

export type ProductWrite = Pick<AdminProduct, 'name' | 'slug'>
  & Partial<Omit<AdminProduct, 'id' | 'created_at' | 'name' | 'slug'>>;
export type ProductPatch = Partial<ProductWrite>;

export interface AdminVariant {
  id: string;
  product_id: string;
  created_at: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  price: number | null;
  stock_quantity: number;
}
export type VariantWrite = Omit<AdminVariant, 'id' | 'created_at'>;
export type VariantField = 'size' | 'color' | 'sku' | 'price' | 'stock_quantity';
export type VariantPatch = Partial<Pick<AdminVariant, VariantField>>;
export type VariantFormValues = { size: string; color: string; sku: string; price: string; stock_quantity: string };

export function productCopy(product: AdminProduct): ProductWrite {
  const { id, created_at, ...rest } = product;
  const name = `${product.name} - کپی`;
  return { ...rest, name, slug: slugify(name), images: [] };
}

export function productFormWrite(values: ProductWrite): ProductWrite {
  return { ...values, name: values.name, slug: slugify(values.slug) };
}

export function variantFormWrite(productId: string, values: VariantFormValues): VariantWrite {
  // Preserve existing coercion; validation/inventory changes belong to Phase 2.
  return {
    product_id: productId, size: values.size || null, color: values.color || null,
    price: values.price ? parseFloat(values.price) : null,
    stock_quantity: parseInt(values.stock_quantity) || 0, sku: values.sku || null,
  };
}
