import type { AdminProduct } from './adminProducts';
export type ProductStatusFilter = 'all' | 'active' | 'draft';
const normalize = (value: string) => value.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLocaleLowerCase();
export function filterAdminProducts(products: AdminProduct[], search: string, status: ProductStatusFilter) {
 const words = normalize(search).split(/\s+/).filter(Boolean);
 return products.filter(product => (status === 'all' || product.is_active === (status === 'active')) &&
  words.every(word => normalize([product.name, product.slug, product.category, ...(product.brand ?? [])].join(' ')).includes(word)));
}
export type ProductStatusTarget = { id: string; expectedActive: boolean };
export const MAX_PRODUCT_BATCH = 50;
export function validateStatusBatch(targets: ProductStatusTarget[], active: boolean) {
 if (typeof active !== 'boolean' || !Array.isArray(targets) || !targets.length || targets.length > MAX_PRODUCT_BATCH ||
  new Set(targets.map(target => target.id)).size !== targets.length || targets.some(target =>
   typeof target.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id) || typeof target.expectedActive !== 'boolean')) throw Error('Invalid product status batch');
 return targets.map(target => ({ id: target.id, expectedActive: target.expectedActive }));
}
