import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminProduct } from './domain/adminProducts';
import { categoryState, previewProductCategories, validateCategoryBatch, validateCategoryEdit, validateCategoryOptions, type CategoryState } from './domain/productCategories';
import { createProductCategoryService } from './application/productCategoryService';
import { createSupabaseProductCategoryRepository } from './infrastructure/supabaseProductCategoryRepository';
import type { ProductBatchReport } from './application/productBatch';
import { ProductCategoryBatchControls } from './presentation/ProductCategoryBatchControls';
import { useAdminProducts } from './presentation/useAdminProducts';
import { adminProductCategories, adminProductPrices, adminProductStatus, adminProducts } from './admin';
import { toast } from 'sonner';
vi.mock('./admin', () => ({ adminProducts: { listProducts: vi.fn(), changePrice: vi.fn() }, adminProductCategories: { listCategories: vi.fn(), update: vi.fn() }, adminProductPrices: { update: vi.fn() }, adminProductStatus: { update: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const id = (index: number) => '87000000-0000-4000-8000-' + String(index).padStart(12, '0');
const categoryA = { id: id(100), name: 'دسته قدیمی', slug: 'old' }, categoryB = { id: id(101), name: 'دسته جدید', slug: 'new' };
const state: CategoryState = { department: 'men', category: 'socks', category_id: categoryA.id };
const product = (index: number) => ({ id: id(index), name: 'محصول دسته ' + index, price: 10000, is_active: true, ...state } as AdminProduct);
const target = (index: number, edit = { department: 'women' }) => ({ id: id(index), expected: { ...state }, next: { ...state, ...edit } });
const empty: ProductBatchReport = { succeeded: [], unchanged: [], failed: [], unattempted: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(adminProducts.listProducts).mockResolvedValue([product(1), product(2)]); vi.mocked(adminProductCategories.listCategories).mockResolvedValue([categoryA, categoryB]); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('explicit independent category fields', () => {
 it('changes only an explicit field without inferring department/type from category slug', () => {
  const p = { ...product(1), brand: ['preserved'], type: ['preserved'], pattern: 'preserved' };
  expect(previewProductCategories([p], { category_id: categoryB.id })).toEqual([{ id: id(1), expected: state, next: { ...state, category_id: categoryB.id } }]);
  expect(p.brand).toEqual(['preserved']); expect(p.category_id).toBe(categoryA.id);
 });
 it('distinguishes keeping fields from explicitly clearing them and supports a full explicit edit', () => {
  expect(previewProductCategories([product(1)], { category_id: null })[0].next).toEqual({ ...state, category_id: null });
  expect(previewProductCategories([product(1)], { department: 'kids', category: 't-shirts', category_id: categoryB.id })[0].next).toEqual({ department: 'kids', category: 't-shirts', category_id: categoryB.id });
 });
 it.each([{}, { department: 'invalid' }, { category: 'made-up' }, { category_id: 'not-a-uuid' }, { price: 0 }, { department: undefined }])('refuses invalid or unrelated category edits (%#)', edit => {
  expect(() => validateCategoryEdit(edit)).toThrow();
 });
 it('rejects missing/null-invalid state and refuses a next snapshot that changes unselected fields', () => {
  expect(() => categoryState({ ...state, category_id: 'bad' })).toThrow();
  expect(() => validateCategoryBatch([{ ...target(1), next: { ...target(1).next, category: 'pants' } }], { department: 'women' })).toThrow();
  expect(() => validateCategoryBatch([target(1), target(1)], { department: 'women' })).toThrow();
 });
 it('validates category choices rather than converting malformed reads to an empty success', () => {
  expect(validateCategoryOptions([categoryA])).toEqual([categoryA]);
  expect(() => validateCategoryOptions([categoryA, categoryA])).toThrow();
  expect(() => validateCategoryOptions([{ ...categoryA, id: 'bad' }])).toThrow();
 });
});
describe('category batch use cases', () => {
 it('rechecks catalog membership before any write and preserves the frozen patch', async () => {
  const listCategories = vi.fn().mockResolvedValue([categoryA, categoryB]), change = vi.fn().mockResolvedValue(undefined);
  const edit = { category_id: categoryB.id }, targets = previewProductCategories([product(1)], edit);
  expect(await createProductCategoryService({ listCategories, change }).update(targets, edit, () => true)).toEqual({ ...empty, succeeded: [id(1)] });
  expect(listCategories).toHaveBeenCalledTimes(1); expect(change).toHaveBeenCalledWith(targets[0], edit);
 });
 it('refuses removed/denied category choices before any product mutation', async () => {
  const change = vi.fn(), listCategories = vi.fn().mockResolvedValue([categoryA]);
  const edit = { category_id: categoryB.id }, targets = previewProductCategories([product(1)], edit);
  await expect(createProductCategoryService({ listCategories, change }).update(targets, edit, () => true)).rejects.toThrow();
  listCategories.mockRejectedValueOnce({ code: '42501' });
  await expect(createProductCategoryService({ listCategories, change }).update(targets, edit, () => true)).rejects.toBeTruthy();
  expect(change).not.toHaveBeenCalled();
 });
 it('can explicitly clear catalog category without inventing a new classification or reading membership', async () => {
  const listCategories = vi.fn(), change = vi.fn().mockResolvedValue(undefined), edit = { category_id: null };
  await createProductCategoryService({ listCategories, change }).update(previewProductCategories([product(1)], edit), edit, () => true);
  expect(listCategories).not.toHaveBeenCalled(); expect(change.mock.calls[0][1]).toEqual({ category_id: null });
 });
 it('stops on a stale/denied product and retains partial results without later requests', async () => {
  const change = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce({ code: 'PGRST116' });
  const result = await createProductCategoryService({ listCategories: vi.fn(), change }).update([target(1), target(2), target(3)], { department: 'women' }, () => true);
  expect(result).toEqual({ ...empty, succeeded: [id(1)], failed: [id(2)], unattempted: [id(3)] }); expect(change).toHaveBeenCalledTimes(2);
 });
 it('skips unchanged rows and stops before dispatch after an account lifetime ends during category loading', async () => {
  let current = true; const change = vi.fn(), listCategories = vi.fn().mockImplementation(async () => { current = false; return [categoryB]; });
  const edit = { category_id: categoryB.id };
  const result = await createProductCategoryService({ listCategories, change }).update(previewProductCategories([product(1)], edit), edit, () => current);
  expect(result.unattempted).toEqual([id(1)]); expect(change).not.toHaveBeenCalled();
  const unchanged = await createProductCategoryService({ listCategories, change }).update(previewProductCategories([product(1)], { department: 'men' }), { department: 'men' }, () => true);
  expect(unchanged.unchanged).toEqual([id(1)]);
 });
});
function adapter(data: unknown, error: unknown = null) {
 const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data, error }), then: (resolve: (result: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data, error }).then(resolve) };
 return { query, service: createSupabaseProductCategoryRepository({ from: vi.fn().mockReturnValue(query) } as unknown as Pick<SupabaseClient<Database>, 'from'>) };
}
describe('category persistence predicates', () => {
 it('writes only the selected patch and compares every previewed category field', async () => {
  const t = target(1), a = adapter({ id: id(1), ...t.next }); await a.service.change(t, { department: 'women' });
  expect(a.query.update).toHaveBeenCalledWith({ department: 'women' });
  expect(a.query.eq.mock.calls).toEqual([['id', id(1)], ['department', 'men'], ['category', 'socks'], ['category_id', categoryA.id]]);
  expect(a.query.select).toHaveBeenCalledWith('id,department,category,category_id');
 });
 it('uses SQL IS NULL rather than equality to null for previous empty fields', async () => {
  const t = { id: id(1), expected: { department: null, category: null, category_id: null }, next: { department: 'women', category: null, category_id: null } };
  const a = adapter({ id: id(1), ...t.next }); await a.service.change(t, { department: 'women' });
  expect(a.query.is.mock.calls).toEqual([['department', null], ['category', null], ['category_id', null]]);
 });
 it.each([null, { id: id(2), ...target(1).next }, { id: id(1), ...state }])('rejects absent or mismatched persistence confirmation (%#)', async data => {
  await expect(adapter(data).service.change(target(1), { department: 'women' })).rejects.toThrow();
 });
 it('propagates category reads/permission errors and refuses a null response', async () => {
  await expect(adapter(null).service.listCategories()).rejects.toThrow();
  const failure = { code: '42501' }; await expect(adapter(null, failure).service.listCategories()).rejects.toBe(failure);
 });
});
describe('category editor and shared batch lock', () => {
 it('loads options only when expanded and requires preview/confirmation before writing', async () => {
  const submit = vi.fn().mockResolvedValue({ ...empty, succeeded: [id(1)] });
  render(<ProductCategoryBatchControls selected={[product(1)]} ownerId="A" busy={false} submit={submit} />);
  expect(adminProductCategories.listCategories).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'ویرایش گروهی دسته‌بندی' }));
  await screen.findByRole('option', { name: 'دسته جدید' });
  fireEvent.change(screen.getByLabelText('دستهٔ کاتالوگ گروهی'), { target: { value: categoryB.id } });
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر دسته‌بندی' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('دسته قدیمی'); expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'انصراف' })); expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر دسته‌بندی' })); fireEvent.click(screen.getByRole('button', { name: 'تأیید و اعمال دسته‌بندی' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith(previewProductCategories([product(1)], { category_id: categoryB.id }), { category_id: categoryB.id }));
 });
 it('keeps an unreadable category list distinct from empty and offers explicit retry', async () => {
  vi.mocked(adminProductCategories.listCategories).mockRejectedValueOnce({ code: '42501' }).mockResolvedValueOnce([]);
  render(<ProductCategoryBatchControls selected={[product(1)]} ownerId="A" busy={false} submit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'ویرایش گروهی دسته‌بندی' }));
  await screen.findByText('بارگیری دسته‌بندی‌ها با شکست مواجه شد.'); expect(screen.queryByLabelText('دستهٔ کاتالوگ گروهی')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' })); await screen.findByLabelText('دستهٔ کاتالوگ گروهی');
  expect(adminProductCategories.listCategories).toHaveBeenCalledTimes(2);
 });
 it('shares the immediate operation lock with price, status and individual mutations', async () => {
  let resolve!: (value: ProductBatchReport) => void;
  vi.mocked(adminProductCategories.update).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result } = renderHook(() => useAdminProducts('A')); await waitFor(() => expect(result.current.products.length).toBe(2));
  let pending!: ReturnType<typeof result.current.bulkCategories>;
  await act(async () => { pending = result.current.bulkCategories([target(1)], { department: 'women' }); await result.current.bulkPrices([{ id: id(1), expectedPrice: 10000, nextPrice: 12000 }]); await result.current.bulkStatus([{ id: id(1), expectedActive: true }], false); await result.current.changePrice(id(1), 12000); });
  expect(adminProductCategories.update).toHaveBeenCalledTimes(1); expect(adminProductPrices.update).not.toHaveBeenCalled(); expect(adminProductStatus.update).not.toHaveBeenCalled(); expect(adminProducts.changePrice).not.toHaveBeenCalled();
  await act(async () => { resolve({ ...empty, succeeded: [id(1)] }); await pending; }); expect(result.current.batchKind).toBe('category');
 });
 it('ignores a delayed old-owner batch completion', async () => {
  let resolve!: (value: ProductBatchReport) => void; vi.mocked(adminProductCategories.update).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result, rerender } = renderHook(({ owner }) => useAdminProducts(owner), { initialProps: { owner: 'A' } });
  await waitFor(() => expect(result.current.products.length).toBe(2));
  let pending!: ReturnType<typeof result.current.bulkCategories>; act(() => { pending = result.current.bulkCategories([target(1)], { department: 'women' }); });
  rerender({ owner: 'B' }); rerender({ owner: 'A' }); expect(vi.mocked(adminProductCategories.update).mock.calls[0][2]()).toBe(false);
  await act(async () => { resolve({ ...empty, succeeded: [id(1)] }); await pending; }); expect(toast.success).not.toHaveBeenCalled();
 });
});
