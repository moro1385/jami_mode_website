import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createCatalogService } from './application/catalogService';
import type { CatalogRepository } from './application/catalogRepository';
import { parseLegacyQuery } from './domain/legacyQuery';
import { mapCatalogProduct, type CatalogRow } from './infrastructure/catalogMapper';
import { createSupabaseCatalogRepository } from './infrastructure/supabaseCatalogRepository';
import { formatPrice, productImage } from './presentation/formatters';

function row(patch: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: 'product-1', name: 'Cotton Socks', slug: 'cotton-socks', description: null,
    price: 50000, is_active: true, is_out_of_stock: false, is_featured: false, is_new: true,
    images: null, created_at: '2026-10-01T00:00:00Z', tags: ['cotton'], department: 'men',
    category: 'socks', brand: ['Jami'], pattern: null, type: [], sizes: ['M'], colors: ['black'],
    categories: { id: 'category-1', name: 'Socks', slug: 'socks' },
    product_images: [{ id: 'late', image_url: '/late.jpg', alt_text: 'Late', sort_order: 2 },
      { id: 'first', image_url: '/first.jpg', alt_text: 'First', sort_order: 1 }],
    product_variants: [{ id: 'variant-1', size: 'M', color: 'black', sku: 'SKU-1', price: 60000, stock_quantity: 3 }],
    ...patch,
  };
}

function port(products = [mapCatalogProduct(row())]): CatalogRepository {
  return {
    findActive: vi.fn().mockResolvedValue(products),
    findActiveBySlug: vi.fn().mockResolvedValue(products[0] ?? null),
    findImages: vi.fn().mockResolvedValue([]), findVariants: vi.fn().mockResolvedValue([]),
    findCategories: vi.fn().mockResolvedValue([]),
  };
}

function transport(products: unknown = [row()], category: unknown = { id: 'category-1' }, failure: unknown = null) {
  const query = (data: unknown, error: unknown) => {
    const result = { data, error };
    return {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
  };
  const productQuery = query(products, failure), categoryQuery = query(category, null);
  const from = vi.fn((table: string) => table === 'categories' ? categoryQuery : productQuery);
  const client = { from } as unknown as Pick<SupabaseClient<Database>, 'from'>;
  return { repository: createSupabaseCatalogRepository(client), productQuery, categoryQuery, from };
}

describe('catalog compatibility during architecture migration', () => {
  it('keeps the current product, price, option and default-variant contract', () => {
    const product = mapCatalogProduct(row()).node;
    expect(product.id).toBe('product-1');
    expect(product.priceRange.minVariantPrice).toEqual({ amount: '50000', currencyCode: 'IRR' });
    expect(product.variants.edges).toEqual([{ node: {
      id: 'product-1', title: 'Default', price: { amount: '50000', currencyCode: 'IRR' },
      availableForSale: true, selectedOptions: [],
    } }]);
    expect(product.options).toEqual([{ name: 'Size', values: ['M'] }, { name: 'Color', values: ['black'] }]);
    expect(product.tags).toEqual(['cotton', 'socks']);
  });

  it('prefers explicit product images and leaves the source untouched', () => {
    const source = row({ images: ['/primary.jpg', '/secondary.jpg'] });
    const original = structuredClone(source);
    expect(mapCatalogProduct(source).node.images.edges).toEqual([
      { node: { url: '/primary.jpg', altText: null } }, { node: { url: '/secondary.jpg', altText: null } },
    ]);
    expect(source).toEqual(original);
  });

  it('sorts fallback images without mutating the stored order', () => {
    const source = row();
    expect(productImage(mapCatalogProduct(source))).toBe('/first.jpg');
    expect(source.product_images?.map(image => image.id)).toEqual(['late', 'first']);
  });

  it('retains unavailable, nullable and placeholder behavior', () => {
    const product = mapCatalogProduct(row({ is_out_of_stock: true, price: null, categories: null,
      product_images: null, tags: null, sizes: null, colors: null, images: [] }));
    expect(product.node.variants.edges[0].node.availableForSale).toBe(false);
    expect(product.node.priceRange.minVariantPrice.amount).toBe('0');
    expect(product.node.tags).toEqual([]);
    expect(product.node.options).toEqual([]);
    expect(productImage(product)).toBe('/placeholder.svg');
    expect(formatPrice('50000')).toBe(Number(50000).toLocaleString('fa-IR') + ' ریال');
  });
});

describe('catalog use cases without a database or browser', () => {
  it('searches title/category tags case-insensitively after repository selection', async () => {
    const repository = port([mapCatalogProduct(row()), mapCatalogProduct(row({ id: 'other', name: 'Shirt', categories: null, tags: [] }))]);
    const service = createCatalogService(repository);
    const result = await service.fetchActiveProducts({ limit: 8, department: 'men', terms: ['SOCKS'] });
    expect(result.map(product => product.node.id)).toEqual(['product-1']);
    expect(repository.findActive).toHaveBeenCalledWith({ limit: 8, department: 'men' });
  });

  it('preserves the difference between absent terms and empty search entries', async () => {
    const service = createCatalogService(port());
    expect(await service.fetchActiveProducts()).toHaveLength(1);
    expect(await service.fetchActiveProducts({ terms: [] })).toHaveLength(1);
    expect(await service.fetchActiveProducts({ terms: [''] })).toEqual([]);
  });

  it('retains featured/newest/category defaults', async () => {
    const repository = port(), service = createCatalogService(repository);
    await service.fetchFeaturedProducts(); await service.fetchNewestProducts();
    await service.fetchProductsByCategory('socks');
    expect(repository.findActive).toHaveBeenNthCalledWith(1, { featured: true, limit: 8 });
    expect(repository.findActive).toHaveBeenNthCalledWith(2, { newest: true, limit: 8 });
    expect(repository.findActive).toHaveBeenNthCalledWith(3, { categorySlug: 'socks', limit: 100 });
  });

  it('does not turn a repository outage into an empty catalog', async () => {
    const repository = port(), failure = Error('synthetic outage');
    vi.mocked(repository.findActive).mockRejectedValue(failure);
    await expect(createCatalogService(repository).fetchActiveProducts()).rejects.toBe(failure);
  });

  it.each([
    [undefined, []],
    ['product_type:"Socks" OR tag:cotton', ['Socks', 'cotton']],
    ['tag:a:b AND tag:set, plain', ['a:b', 'set', 'plain']],
  ])('keeps legacy query parsing for %s', (input, expected) => {
    expect(parseLegacyQuery(input)).toEqual(expected);
  });
});

describe('read-only repository contract', () => {
  it('preserves active-only filters, ordering, limits and category lookup', async () => {
    const { repository, productQuery, categoryQuery } = transport();
    const products = await repository.findActive({ limit: 8, featured: true, newest: true,
      categorySlug: 'socks', department: 'men', category: 'socks' });
    expect(products).toHaveLength(1);
    expect(productQuery.eq.mock.calls).toEqual([['is_active', true], ['is_featured', true], ['is_new', true], ['category_id', 'category-1']]);
    expect(productQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(productQuery.limit).toHaveBeenCalledWith(8);
    expect(productQuery.ilike.mock.calls).toEqual([['department', 'men'], ['category', 'socks']]);
    expect(categoryQuery.eq).toHaveBeenCalledWith('slug', 'socks');
  });

  it('returns an empty category result without executing an unfiltered product read', async () => {
    const { repository, productQuery } = transport([row()], null);
    const execute = vi.spyOn(productQuery, 'then');
    expect(await repository.findActive({ categorySlug: 'missing' })).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('retains active-only detail lookup, null result and original errors', async () => {
    const missing = transport(null);
    expect(await missing.repository.findActiveBySlug('missing')).toBeNull();
    expect(missing.productQuery.eq.mock.calls).toEqual([['slug', 'missing'], ['is_active', true]]);
    const error = { code: 'SYNTHETIC_OUTAGE' }, failed = transport([], null, error);
    await expect(failed.repository.findActive({})).rejects.toBe(error);
  });
});
