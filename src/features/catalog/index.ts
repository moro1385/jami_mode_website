export type { CatalogProduct, CatalogVariant, ProductQueryOptions } from './domain/catalog';
export { CURRENCY_CODE } from './domain/catalog';
export {
  fetchActiveProducts, fetchFeaturedProducts, fetchNewestProducts, fetchProductsByCategory,
  fetchProductBySlug, fetchProductImages, fetchProductVariants, fetchCategories,
} from './catalog';
export { formatPrice, productImage } from './presentation/formatters';
