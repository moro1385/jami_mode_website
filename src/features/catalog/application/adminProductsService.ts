import { productCopy, productFormWrite, variantFormWrite, type AdminProduct, type AdminVariant,
  type ProductWrite, type VariantField, type VariantFormValues } from '../domain/adminProducts';
import type { AdminProductsRepository } from './adminProductsRepository';

export function createAdminProductsService(repository: AdminProductsRepository) {
  return {
    listProducts: () => repository.listProducts(),
    deleteProduct: async (_id: string): Promise<void> => { throw Error('حذف دائمی محصول بسته است؛ از وضعیت پیش‌نویس استفاده کنید.'); },
    changePrice: (id: string, price: number) => repository.updateProduct(id, { price }),
    duplicateProduct: (product: AdminProduct) => repository.insertProduct(productCopy(product)),
    saveProduct: (values: ProductWrite, id?: string) => id
      ? repository.updateProduct(id, productFormWrite(values))
      : repository.insertProduct(productFormWrite(values)),
    listVariants: (productId: string) => repository.listVariants(productId),
    addVariant: async (productId: string, values: VariantFormValues) => repository.insertVariant(variantFormWrite(productId, values)),
    deleteVariant: async (_id: string): Promise<void> => { throw Error('حذف دائمی تنوع برای حفظ موجودی و سابقه بسته است.'); },
    updateVariantField: async <K extends VariantField>(id: string, field: K, value: AdminVariant[K]) => {
      if (field === 'stock_quantity') throw Error('برای تغییر موجودی از مسیر اصلاح و تاریخچه استفاده کنید.');
      await repository.updateVariant(id, { [field]: value === '' ? null : value });
    },
  };
}
