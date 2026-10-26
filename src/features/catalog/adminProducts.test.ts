import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createAdminProductsService } from './application/adminProductsService';
import type { AdminProductsRepository } from './application/adminProductsRepository';
import type { AdminProduct, AdminVariant } from './domain/adminProducts';
import { createSupabaseAdminProductsRepository } from './infrastructure/supabaseAdminProductsRepository';

const product: AdminProduct = {
  id: 'synthetic-product', name: 'جوراب', slug: 'جوراب', price: 50000,
  created_at: '2026-10-01', description: 'Cotton', category_id: 'synthetic-category',
  is_active: false, is_featured: true, is_new: false, is_out_of_stock: false,
  images: ['/existing.jpg'], tags: ['cotton'], department: 'men', category: 'socks',
  type: ['plain'], brand: ['Jami'], pattern: 'plain', sizes: ['M'], colors: ['black'],
};
const variant: AdminVariant = {
  id: 'synthetic-variant', product_id: product.id, created_at: '2026-10-01',
  size: 'M', color: 'black', sku: 'sku-1', price: 50000, stock_quantity: 2,
};
function port(): AdminProductsRepository {
  return {
    listProducts: vi.fn().mockResolvedValue([product]), insertProduct: vi.fn().mockResolvedValue(undefined),
    updateProduct: vi.fn().mockResolvedValue(undefined), deleteProduct: vi.fn().mockResolvedValue(undefined),
    listVariants: vi.fn().mockResolvedValue([variant]), insertVariant: vi.fn().mockResolvedValue(variant),
    updateVariant: vi.fn().mockResolvedValue(undefined), deleteVariant: vi.fn().mockResolvedValue(undefined),
  };
}

describe('admin product use cases with audited stock boundary', () => {
  it.each(['deleteProduct', 'deleteVariant'] as const)('blocks %s even when the supplied repository could delete', async method => {
    const repository = port();
    await expect(createAdminProductsService(repository)[method]('synthetic-id')).rejects.toThrow('حذف دائمی');
    expect(repository.deleteProduct).not.toHaveBeenCalled();expect(repository.deleteVariant).not.toHaveBeenCalled();
  });
  it.each(['1', '-1', '1e3', 'NaN'])('refuses nonzero or malformed initial stock %s before insert', async stock_quantity => {
    const repository = port();
    await expect(createAdminProductsService(repository).addVariant(product.id,
      {size:'M',color:'',sku:'',price:'',stock_quantity})).rejects.toThrow();
    expect(repository.insertVariant).not.toHaveBeenCalled();
  });
  it('copies attributes but never reuses identity, creation time or image attachments', async () => {
    const repository = port(), original = structuredClone(product);
    await createAdminProductsService(repository).duplicateProduct(product);
    const copy = vi.mocked(repository.insertProduct).mock.calls[0][0];
    expect(copy).toMatchObject({ name: 'جوراب - کپی', slug: 'جوراب-کپی', images: [],
      price: 50000, is_active: false, sizes: ['M'], colors: ['black'] });
    expect(copy).not.toHaveProperty('id'); expect(copy).not.toHaveProperty('created_at');
    expect(product).toEqual(original);
  });

  it('normalizes the form slug for both create and update without mutating input', async () => {
    const repository = port(), service = createAdminProductsService(repository);
    const input = { name: 'جوراب', slug: ' /جوراب  جدید? ', price: 50000, sizes: ['M'] };
    await service.saveProduct(input); await service.saveProduct(input, product.id);
    expect(repository.insertProduct).toHaveBeenCalledWith({ ...input, slug: 'جوراب-جدید' });
    expect(repository.updateProduct).toHaveBeenCalledWith(product.id, { ...input, slug: 'جوراب-جدید' });
    expect(input.slug).toBe(' /جوراب  جدید? ');
  });

  it('updates only the requested product price', async () => {
    const repository = port();
    await createAdminProductsService(repository).changePrice(product.id, 60000);
    expect(repository.updateProduct).toHaveBeenCalledWith(product.id, { price: 60000 });
    expect(repository.insertProduct).not.toHaveBeenCalled();
  });

  it('retains blank optional variant fields and numeric form conversion', async () => {
    const repository = port();
    const result = await createAdminProductsService(repository).addVariant(product.id,
      { size: 'M', color: '', sku: '', price: '', stock_quantity: '' });
    expect(repository.insertVariant).toHaveBeenCalledWith({ product_id: product.id, size: 'M', color: null,
      sku: null, price: null, stock_quantity: 0 });
    expect(result).toBe(variant);
  });

  it('does not treat a zero price or stock as a missing form number', async () => {
    const repository = port();
    await createAdminProductsService(repository).addVariant(product.id,
      { size: '', color: 'black', sku: 'sku-2', price: '0', stock_quantity: '0' });
    expect(repository.insertVariant).toHaveBeenCalledWith({ product_id: product.id, size: null,
      color: 'black', sku: 'sku-2', price: 0, stock_quantity: 0 });
  });

  it('clears an optional field without replacing the rest of the variant', async () => {
    const repository = port(), service = createAdminProductsService(repository);
    await service.updateVariantField(variant.id, 'size', '');
    await expect(service.updateVariantField(variant.id, 'stock_quantity', 0)).rejects.toThrow();
    expect(repository.updateVariant).toHaveBeenNthCalledWith(1, variant.id, { size: null });
    expect(repository.updateVariant).toHaveBeenCalledTimes(1);
  });

  it('preserves unique-constraint errors so the UI can show the existing slug message', async () => {
    const repository = port(), error = { code: '23505', message: 'products_slug_key' };
    vi.mocked(repository.insertProduct).mockRejectedValue(error);
    await expect(createAdminProductsService(repository).duplicateProduct(product)).rejects.toBe(error);
  });
});

function transport(data: unknown = [], error: unknown = null) {
  const result = { data, error };
  const query = {
    select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const from = vi.fn().mockReturnValue(query);
  return { query, from, repository: createSupabaseAdminProductsRepository({ from } as unknown as Pick<SupabaseClient<Database>, 'from'>) };
}

describe('signed-in admin data adapter', () => {
  it.each(['deleteProduct', 'deleteVariant'] as const)('blocks %s before any request', async method => {
    const {repository,from} = transport();
    await expect(repository[method]('synthetic-id')).rejects.toThrow('حذف دائمی');
    expect(from).not.toHaveBeenCalled();
  });
  it('refuses stock patches even alongside otherwise allowed identity fields before network access', async () => {
    const {repository,from} = transport();
    await expect(repository.updateVariant(variant.id, {size:'L',stock_quantity:0})).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it('refuses nonzero initial stock before network access', async () => {
    const {repository,from} = transport();
    await expect(repository.insertVariant({product_id:product.id,size:'M',color:null,sku:null,price:null,stock_quantity:2})).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it('lists drafts as well as active products in the original order', async () => {
    const { repository, query, from } = transport([product]);
    expect(await repository.listProducts()).toEqual([product]);
    expect(from).toHaveBeenCalledWith('products');
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(query.eq).not.toHaveBeenCalled();
  });

  it('keeps each product update and delete bound to its supplied id', async () => {
    const { repository, query } = transport();
    await repository.updateProduct(product.id, { price: 60000 });
    await expect(repository.deleteProduct(product.id)).rejects.toThrow('حذف دائمی');
    expect(query.update).toHaveBeenCalledWith({ price: 60000 });
    expect(query.eq.mock.calls).toEqual([['id', product.id]]);
    expect(query.delete).not.toHaveBeenCalled();
  });

  it('retains the product insert array contract', async () => {
    const { repository, query } = transport();
    const input = { name: 'جوراب', slug: 'جوراب' };
    await repository.insertProduct(input);
    expect(query.insert).toHaveBeenCalledWith([input]);
  });

  it('keeps variant reads scoped to the product and oldest-first', async () => {
    const { repository, query, from } = transport([variant]);
    expect(await repository.listVariants(product.id)).toEqual([variant]);
    expect(from).toHaveBeenCalledWith('product_variants');
    expect(query.eq).toHaveBeenCalledWith('product_id', product.id);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('returns the persisted variant after insert and keeps mutation ids', async () => {
    const { repository, query } = transport(variant);
    const input = { product_id: product.id, size: 'M', color: null, price: null, stock_quantity: 0, sku: null };
    expect(await repository.insertVariant(input)).toBe(variant);
    expect(query.insert).toHaveBeenCalledWith({product_id:product.id,size:'M',color:null,price:null,sku:null});
    await repository.updateVariant(variant.id, { size: 'L' }); await expect(repository.deleteVariant(variant.id)).rejects.toThrow('حذف دائمی');
    expect(query.eq.mock.calls).toEqual([['id', variant.id]]);
    expect(query.delete).not.toHaveBeenCalled();
  });

  it('propagates RLS/permission failures without fallback clients or apparent success', async () => {
    const failure = { code: '42501', message: 'Synthetic permission denied' };
    const { repository } = transport(null, failure);
    await expect(repository.listProducts()).rejects.toBe(failure);
    await expect(repository.insertProduct({ name: 'x', slug: 'x' })).rejects.toBe(failure);
    await expect(repository.updateProduct(product.id, { price: 1 })).rejects.toBe(failure);
    await expect(repository.deleteProduct(product.id)).rejects.toThrow('حذف دائمی');
    await expect(repository.insertVariant({ product_id: product.id, size: 'M', color: null, price: null, sku: null, stock_quantity: 0 })).rejects.toBe(failure);
  });
});
