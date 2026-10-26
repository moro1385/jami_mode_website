import { sameCategoryState, validateCategoryBatch, validateCategoryEdit, validateCategoryOptions, type CategoryEdit, type CategoryOption, type ProductCategoryTarget } from '../domain/productCategories';
import { runProductBatch } from './productBatch';
export interface ProductCategoryRepository { listCategories(): Promise<CategoryOption[]>; change(target: ProductCategoryTarget, edit: CategoryEdit): Promise<void> }
export function createProductCategoryService(repository: ProductCategoryRepository) {
 const listCategories = async () => validateCategoryOptions(await repository.listCategories());
 return { listCategories, async update(targets: ProductCategoryTarget[], edit: CategoryEdit, current: () => boolean) {
  const patch = validateCategoryEdit(edit), queue = validateCategoryBatch(targets, patch);
  if (current() && patch.category_id != null && !(await listCategories()).some(option => option.id === patch.category_id)) throw Error('دستهٔ کاتالوگ دیگر در دسترس نیست؛ فهرست را دوباره بارگیری کنید.');
  return runProductBatch(queue, target => sameCategoryState(target.expected, target.next), target => repository.change(target, patch), current);
 } };
}
