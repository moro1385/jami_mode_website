import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminProduct } from './domain/adminProducts';
import { filterAdminProducts, validateStatusBatch } from './domain/productManagement';
import { createProductStatusService } from './application/productStatusService';
import { createSupabaseProductStatusRepository } from './infrastructure/supabaseProductStatusRepository';
import { useAdminProducts } from './presentation/useAdminProducts';
import AdminProducts from '@/pages/admin/AdminProducts';
import { adminProducts, adminProductStatus } from './admin';
import { toast } from 'sonner';
const auth = vi.hoisted(() => ({ id: 'synthetic-admin-A' }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: auth.id } }) }));
vi.mock('./admin', () => ({ adminProducts: { listProducts: vi.fn(), duplicateProduct: vi.fn(), changePrice: vi.fn(), deleteProduct: vi.fn() }, adminProductStatus: { update: vi.fn() } }));
vi.mock('@/components/admin/ProductFormDialog', () => ({ ProductFormDialog: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const id = (index: number) => '82000000-0000-4000-8000-' + String(index).padStart(12, '0');
const product = (index: number, active = true): AdminProduct => ({ id: id(index), name: 'کالای ' + index, slug: 'product-' + index, price: 10000, created_at: '2026-01-01', description: null, category_id: null, is_active: active, is_featured: false, is_new: false, is_out_of_stock: false, images: [], tags: [], department: null, category: null, type: [], brand: [], pattern: null, sizes: [], colors: [] });
const target = (index: number, expectedActive = true) => ({ id: id(index), expectedActive });
beforeEach(() => { vi.resetAllMocks(); auth.id = 'synthetic-admin-A'; vi.mocked(adminProducts.listProducts).mockResolvedValue([product(1), product(2)]); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('product management selection and validation', () => {
 it('matches all search words across name, slug, brand and category with Persian normalization', () => {
  const p = { ...product(1), name: 'كفش ياس', brand: ['Jami'], category: 'زنانه' };
  expect(filterAdminProducts([p], 'کفش یاس jami زنانه', 'active')).toEqual([p]);
  expect(filterAdminProducts([p], 'ناموجود', 'all')).toEqual([]);
  expect(filterAdminProducts([p], '', 'draft')).toEqual([]);
 });
 it.each([[], [target(1), target(1)], Array.from({ length: 51 }, (_, i) => target(i)), [{ id: 'not-a-uuid', expectedActive: true }]].map(targets => ({ targets })))('rejects invalid selections before any write (%#)', ({ targets }) => {
  expect(() => validateStatusBatch(targets, false)).toThrow();
 });
 it('copies only allowlisted target fields', () => {
  const input = [{ ...target(1), price: 0 }];
  expect(validateStatusBatch(input, false)).toEqual([target(1)]);
 });
});
describe('bounded sequential status changes', () => {
 it('skips unchanged targets and changes only the selected rows in order', async () => {
  const change = vi.fn().mockResolvedValue(undefined);
  const result = await createProductStatusService({ change }).update([target(1, false), target(2), target(3)], false, () => true);
  expect(change.mock.calls).toEqual([[target(2), false], [target(3), false]]);
  expect(result).toEqual({ succeeded: [id(2), id(3)], unchanged: [id(1)], failed: [], unattempted: [] });
 });
 it('stops after a refused/ambiguous write and never pretends earlier successes were rolled back', async () => {
  const change = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce({ code: '42501' });
  const result = await createProductStatusService({ change }).update([target(1), target(2), target(3)], false, () => true);
  expect(change).toHaveBeenCalledTimes(2);
  expect(result).toEqual({ succeeded: [id(1)], unchanged: [], failed: [id(2)], unattempted: [id(3)] });
 });
 it('does not dispatch remaining writes when an account/form lifetime ends', async () => {
  let current = true;
  const change = vi.fn().mockImplementation(async () => { current = false; });
  const result = await createProductStatusService({ change }).update([target(1), target(2)], false, () => current);
  expect(change).toHaveBeenCalledTimes(1); expect(result.unattempted).toEqual([id(2)]);
 });
 it('does not start writes for an already obsolete lifetime or an invalid batch', async () => {
  const change = vi.fn(), service = createProductStatusService({ change });
  expect((await service.update([target(1)], false, () => false)).unattempted).toEqual([id(1)]);
  await expect(service.update([target(1), target(1)], false, () => true)).rejects.toThrow();
  expect(change).not.toHaveBeenCalled();
 });
});
function adapter(data: unknown, error: unknown = null) {
 const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data, error }) };
 const from = vi.fn().mockReturnValue(query);
 return { query, from, repository: createSupabaseProductStatusRepository({ from } as unknown as Pick<SupabaseClient<Database>, 'from'>) };
}
describe('status persistence confirmation', () => {
 it('uses only is_active and predicates on the selected id and previewed old state', async () => {
  const s = adapter({ id: id(1), is_active: false }); await s.repository.change(target(1), false);
  expect(s.from).toHaveBeenCalledWith('products'); expect(s.query.update).toHaveBeenCalledWith({ is_active: false });
  expect(s.query.eq.mock.calls).toEqual([['id', id(1)], ['is_active', true]]); expect(s.query.select).toHaveBeenCalledWith('id,is_active');
 });
 it.each([null, { id: id(2), is_active: false }, { id: id(1), is_active: true }])('refuses missing or mismatched confirmation (%#)', async data => {
  await expect(adapter(data).repository.change(target(1), false)).rejects.toThrow();
 });
 it('propagates database permission and zero-row errors', async () => {
  const failure = { code: 'PGRST116' };
  await expect(adapter(null, failure).repository.change(target(1), false)).rejects.toBe(failure);
 });
});
describe('bulk status hook ownership and locks', () => {
 it('immediately blocks double submission and individual changes while the batch is pending', async () => {
  let resolve!: (value: { succeeded: string[]; unchanged: string[]; failed: string[]; unattempted: string[] }) => void;
  vi.mocked(adminProductStatus.update).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result } = renderHook(() => useAdminProducts(auth.id));
  await waitFor(() => expect(result.current.products.length).toBe(2));
  let first!: ReturnType<typeof result.current.bulkStatus>;
  await act(async () => { first = result.current.bulkStatus([target(1)], false); await result.current.bulkStatus([target(1)], false); await result.current.changePrice(id(1), 50000); });
  expect(adminProductStatus.update).toHaveBeenCalledTimes(1); expect(adminProducts.changePrice).not.toHaveBeenCalled();
  await act(async () => { resolve({ succeeded: [id(1)], unchanged: [], failed: [], unattempted: [] }); await first; });
  expect(result.current.busy).toBe(false); expect(toast.success).toHaveBeenCalledTimes(1);
 });
 it('does not report success, retry or continue dispatch after A -> B -> A', async () => {
  let resolve!: (value: { succeeded: string[]; unchanged: string[]; failed: string[]; unattempted: string[] }) => void;
  vi.mocked(adminProductStatus.update).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result, rerender } = renderHook(({ owner }) => useAdminProducts(owner), { initialProps: { owner: 'A' } });
  await waitFor(() => expect(result.current.products.length).toBe(2));
  let pending!: ReturnType<typeof result.current.bulkStatus>;
  act(() => { pending = result.current.bulkStatus([target(1)], false); });
  rerender({ owner: 'B' }); rerender({ owner: 'A' });
  const current = vi.mocked(adminProductStatus.update).mock.calls[0][2]; expect(current()).toBe(false);
  const reads = vi.mocked(adminProducts.listProducts).mock.calls.length;
  await act(async () => { resolve({ succeeded: [id(1)], unchanged: [], failed: [], unattempted: [] }); await pending; });
  expect(toast.success).not.toHaveBeenCalled(); expect(adminProducts.listProducts).toHaveBeenCalledTimes(reads);
 });
});
describe('admin product management UI', () => {
 it('filters loaded products and clears hidden selections before preview', async () => {
  render(<AdminProducts />);
  fireEvent.click(await screen.findByLabelText('انتخاب کالای 1'));
  fireEvent.change(screen.getByLabelText('جست‌وجوی محصولات'), { target: { value: 'product-2' } });
  expect(screen.queryByText('کالای 1')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'پیش‌نمایش تغییر وضعیت' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('انتخاب کالای 2'));
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر وضعیت' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument(); expect(adminProductStatus.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'انصراف' })); expect(adminProductStatus.update).not.toHaveBeenCalled();
 });
 it('reports partial completion and reloads persisted state without claiming complete success', async () => {
  vi.mocked(adminProductStatus.update).mockResolvedValue({ succeeded: [id(1)], unchanged: [], failed: [id(2)], unattempted: [] });
  render(<AdminProducts />); await screen.findByLabelText('انتخاب کالای 1');
  fireEvent.click(screen.getByLabelText('انتخاب محصولات نمایش‌داده‌شده'));
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر وضعیت' }));
  fireEvent.click(await screen.findByRole('button', { name: 'تأیید و اعمال وضعیت' }));
  expect(await screen.findByText(/نتیجهٔ 1 مورد تأیید نشد/)).toBeInTheDocument();
  expect(adminProductStatus.update).toHaveBeenCalledWith([target(1), target(2)], false, expect.any(Function));
  expect(toast.success).not.toHaveBeenCalled(); expect(adminProducts.listProducts).toHaveBeenCalledTimes(2);
 });
});
