import type { CatalogCategory, CatalogImage, CatalogProduct, CatalogStoredVariant, ProductQueryOptions } from '../domain/catalog';

export type CatalogReadOptions = Omit<ProductQueryOptions, 'terms'>;

export interface CatalogRepository {
  findActive(options: CatalogReadOptions): Promise<CatalogProduct[]>;
  findActiveBySlug(slug: string): Promise<CatalogProduct | null>;
  findImages(productId: string): Promise<CatalogImage[]>;
  findVariants(productId: string): Promise<CatalogStoredVariant[]>;
  findCategories(): Promise<CatalogCategory[]>;
}
