import { productCopy, productFormWrite, variantFormWrite, type AdminProduct, type AdminVariant,
  type ProductWrite, type VariantField, type VariantFormValues } from '../domain/adminProducts';
import type { AdminProductsRepository } from './adminProductsRepository';

export function createAdminProductsService(repository: AdminProductsRepository) {
  return {
    listProducts: () => repository.listProducts(),
    deleteProduct: (id: string) => repository.deleteProduct(id),
    changePrice: (id: string, price: number) => repository.updateProduct(id, { price }),
    duplicateProduct: (product: AdminProduct) => repository.insertProduct(productCopy(product)),
    saveProduct: (values: ProductWrite, id?: string) => id
      ? repository.updateProduct(id, productFormWrite(values))
      : repository.insertProduct(productFormWrite(values)),
    listVariants: (productId: string) => repository.listVariants(productId),
    addVariant: (productId: string, values: VariantFormValues) => repository.insertVariant(variantFormWrite(productId, values)),
    deleteVariant: (id: string) => repository.deleteVariant(id),
    updateVariantField: <K extends VariantField>(id: string, field: K, value: AdminVariant[K]) =>
      repository.updateVariant(id, { [field]: value === '' ? null : value }),
  };
}
