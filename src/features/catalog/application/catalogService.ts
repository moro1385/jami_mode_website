import type { ProductQueryOptions } from '../domain/catalog';
import type { CatalogRepository } from './catalogRepository';

export function createCatalogService(repository: CatalogRepository) {
  async function fetchActiveProducts(options: ProductQueryOptions = {}) {
    const { terms, ...filters } = options;
    const products = await repository.findActive(filters);
    if (!terms?.length) return products;
    // Preserve filtering after the repository's limit, including empty-term behavior.
    const needles = terms.map(term => term.toLowerCase()).filter(Boolean);
    return products.filter(product => needles.some(needle =>
      product.node.title.toLowerCase().includes(needle)
      || product.node.tags.some(tag => tag.toLowerCase().includes(needle))));
  }

  return {
    fetchActiveProducts,
    fetchFeaturedProducts: (limit = 8) => fetchActiveProducts({ featured: true, limit }),
    fetchNewestProducts: (limit = 8) => fetchActiveProducts({ newest: true, limit }),
    fetchProductsByCategory: (categorySlug: string, limit = 100) => fetchActiveProducts({ categorySlug, limit }),
    fetchProductBySlug: (slug: string) => repository.findActiveBySlug(slug),
    fetchProductImages: (productId: string) => repository.findImages(productId),
    fetchProductVariants: (productId: string) => repository.findVariants(productId),
    fetchCategories: () => repository.findCategories(),
  };
}
