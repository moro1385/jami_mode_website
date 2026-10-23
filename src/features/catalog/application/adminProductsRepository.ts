import type { AdminProduct, AdminVariant, ProductPatch, ProductWrite, VariantPatch, VariantWrite } from '../domain/adminProducts';

export interface AdminProductsRepository {
  listProducts(): Promise<AdminProduct[]>;
  insertProduct(product: ProductWrite): Promise<void>;
  updateProduct(id: string, patch: ProductPatch): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  listVariants(productId: string): Promise<AdminVariant[]>;
  insertVariant(variant: VariantWrite): Promise<AdminVariant>;
  updateVariant(id: string, patch: VariantPatch): Promise<void>;
  deleteVariant(id: string): Promise<void>;
}
