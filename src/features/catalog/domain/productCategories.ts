import { validateStatusBatch } from './productManagement';
export const productDepartments = [{ value: 'men', label: 'مردانه' }, { value: 'women', label: 'زنانه' }, { value: 'kids', label: 'بچگانه' }];
export const productKinds = [{ value: 'socks', label: 'جوراب' }, { value: 'underwear', label: 'شورت' }, { value: 'undershirts', label: 'زیرپوش' }, { value: 'pants', label: 'شلوار' }, { value: 'shorts', label: 'شلوارک' }, { value: 't-shirts', label: 'تی‌شرت' }, { value: 'tank-tops', label: 'تاپ' }, { value: 'sets', label: 'ست' }];
export const categoryFields = ['department', 'category', 'category_id'] as const;
export type CategoryState = { department: string | null; category: string | null; category_id: string | null };
export type CategoryEdit = Partial<CategoryState>;
export type CategoryOption = { id: string; name: string; slug: string };
export type ProductCategoryTarget = { id: string; expected: CategoryState; next: CategoryState };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function categoryState(value: CategoryState): CategoryState {
 if (!value || categoryFields.some(key => value[key] !== null && (typeof value[key] !== 'string' || !value[key] || value[key]!.length > 200)) || (value.category_id !== null && !uuid(value.category_id))) throw Error('دسته‌بندی فعلی یکی از محصولات معتبر نیست.');
 return { department: value.department, category: value.category, category_id: value.category_id };
}
export const sameCategoryState = (a: CategoryState, b: CategoryState) => categoryFields.every(key => a[key] === b[key]);
export function validateCategoryEdit(edit: CategoryEdit): CategoryEdit {
 if (!edit || typeof edit !== 'object' || !Object.keys(edit).length || Object.keys(edit).some(key => !categoryFields.includes(key as typeof categoryFields[number]))) throw Error('فیلدهای تغییر دسته‌بندی معتبر نیستند.');
 const result: CategoryEdit = {};
 for (const key of categoryFields) if (Object.prototype.hasOwnProperty.call(edit, key)) {
  const value = edit[key];
  const valid = value === null || (key === 'department' ? productDepartments.some(option => option.value === value) : key === 'category' ? productKinds.some(option => option.value === value) : uuid(value));
  if (!valid) throw Error('دسته‌بندی انتخاب‌شده معتبر نیست.');
  result[key] = value;
 }
 return result;
}
export function previewProductCategories(products: (CategoryState & { id: string })[], edit: CategoryEdit): ProductCategoryTarget[] {
 const patch = validateCategoryEdit(edit);
 return validateCategoryBatch(products.map(product => { const expected = categoryState(product); return { id: product.id, expected, next: { ...expected, ...patch } }; }), patch);
}
export function validateCategoryBatch(targets: ProductCategoryTarget[], edit: CategoryEdit): ProductCategoryTarget[] {
 const patch = validateCategoryEdit(edit);
 if (!Array.isArray(targets)) throw Error('انتخاب محصولات معتبر نیست.');
 validateStatusBatch(targets.map(target => ({ id: target.id, expectedActive: true })), true);
 return targets.map(target => {
  const expected = categoryState(target.expected), next = categoryState(target.next);
  if (!sameCategoryState(next, { ...expected, ...patch })) throw Error('پیش‌نمایش دسته‌بندی با تغییر انتخاب‌شده مطابقت ندارد.');
  return { id: target.id, expected, next };
 });
}
export function validateCategoryOptions(options: CategoryOption[]): CategoryOption[] {
 if (!Array.isArray(options) || options.some(option => !uuid(option?.id) || typeof option.name !== 'string' || !option.name.trim() || typeof option.slug !== 'string' || !option.slug.trim()) || new Set(options.map(option => option.id)).size !== options.length) throw Error('فهرست دسته‌بندی‌ها معتبر نیست.');
 return options.map(option => ({ id: option.id, name: option.name, slug: option.slug }));
}
export function categoryFilterLabel(state: Pick<CategoryState, 'department' | 'category'>) {
 return [productDepartments.find(option => option.value === state.department)?.label ?? state.department ?? '—', productKinds.find(option => option.value === state.category)?.label ?? state.category ?? '—'].join(' / ');
}
