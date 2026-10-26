import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminProduct } from './domain/adminProducts';
import { existingImageList, imagesEqual, validateImageBatch } from './domain/productImageBatches';
import { createProductImageBatchService } from './application/productImageBatchService';
import { createSupabaseProductImageBatchRepository } from './infrastructure/supabaseProductImageBatchRepository';
import { postgresImageArray } from './infrastructure/postgresImageArray';
import { ProductImageBatchControls } from './presentation/ProductImageBatchControls';
import { useAdminProducts } from './presentation/useAdminProducts';
import { adminProductImageBatch, adminProductPrices, adminProductStatus, adminProductCategories, adminProducts } from './admin';
import type { ProductBatchReport } from './application/productBatch';
import { toast } from 'sonner';
vi.mock('./admin', () => ({ adminProducts: { listProducts: vi.fn(), changePrice: vi.fn() }, adminProductImageBatch: { update: vi.fn() }, adminProductPrices: { update: vi.fn() }, adminProductStatus: { update: vi.fn() }, adminProductCategories: { update: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const id = (index: number) => '90000000-0000-4000-8000-' + String(index).padStart(12, '0');
const a = '/placeholder.svg?image=a', b = '/placeholder.svg?image=b', c = '/placeholder.svg?image=c';
const product = (index: number, images = [a, b, c]) => ({ id: id(index), name: 'محصول تصویر ' + index, price: 10000, is_active: true, department: null, category: null, category_id: null, images } as AdminProduct);
const target = (index: number) => ({ id: id(index), expected: [a, b, c], next: [b, a] });
const empty: ProductBatchReport = { succeeded: [], unchanged: [], failed: [], unattempted: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(adminProducts.listProducts).mockResolvedValue([product(1), product(2)]); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('existing product image edits', () => {
 it('allows a reordered subset, copies snapshots and preserves duplicate occurrence counts', () => {
  const input = { ...target(1), price: 0 }; expect(validateImageBatch([input])).toEqual([target(1)]);
  const snapshot = validateImageBatch([input]); input.next.push(c); expect(snapshot[0].next).toEqual([b, a]);
  expect(validateImageBatch([{ id: id(1), expected: [a, a, b], next: [b, a] }])[0].next).toEqual([b, a]);
 });
 it('refuses cross-product/new references, duplicating extra occurrences and clearing the last image', () => {
  expect(() => validateImageBatch([{ ...target(1), next: ['/new.svg'] }])).toThrow();
  expect(() => validateImageBatch([{ ...target(1), next: [a, a] }])).toThrow();
  expect(() => validateImageBatch([{ ...target(1), next: [] }])).toThrow();
 });
 it('keeps an empty main list unchanged instead of converting a legacy fallback into a new array', () => {
  expect(validateImageBatch([{ id: id(1), expected: [], next: [] }])).toEqual([{ id: id(1), expected: [], next: [] }]);
  expect(imagesEqual([], undefined)).toBe(false);
 });
 it.each(['javascript:alert(1)', 'data:image/png;base64,AAAA', '//third-party.invalid/a.jpg', 'https://user:password@cdn.invalid/a.jpg', 'https://cdn.invalid/' + String.fromCharCode(0), '/\u0000', String.fromCharCode(0xd800)])('refuses invalid persisted image strings (%#)', url => {
  if (url === '/\u0000') expect(() => existingImageList([url.replace('\u0000', String.fromCharCode(0))])).toThrow();
  else expect(() => existingImageList([url])).toThrow();
 });
 it('rejects duplicate targets, oversized lists and malformed snapshots', () => {
  expect(() => validateImageBatch([target(1), target(1)])).toThrow();
  expect(() => existingImageList(Array(51).fill(a))).toThrow(); expect(() => existingImageList(null)).toThrow();
 });
});
describe('image batches share ordered, owner-scoped execution', () => {
 it('skips no-ops and stops after refusal without later requests or storage deletion', async () => {
  const change = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce({ code: '42501' });
  const result = await createProductImageBatchService({ change }).update([{ id: id(0), expected: [], next: [] }, target(1), target(2), target(3)], () => true);
  expect(result).toEqual({ succeeded: [id(1)], unchanged: [id(0)], failed: [id(2)], unattempted: [id(3)] }); expect(change).toHaveBeenCalledTimes(2);
 });
 it('stops queued dispatch after the account lifetime ends', async () => {
  let current = true; const change = vi.fn().mockImplementation(async () => { current = false; });
  expect((await createProductImageBatchService({ change }).update([target(1), target(2)], () => current)).unattempted).toEqual([id(2)]);
  expect(change).toHaveBeenCalledTimes(1);
 });
});
function adapter(data: unknown, error: unknown = null) {
 const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), filter: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data, error }) };
 const from = vi.fn().mockReturnValue(query);
 return { query, from, repository: createSupabaseProductImageBatchRepository({ from } as unknown as Pick<SupabaseClient<Database>, 'from'>) };
}
describe('exact previous-order confirmation', () => {
 it('writes only images and checks full ordered array equality rather than membership', async () => {
  const s = adapter({ id: id(1), images: [b, a] }); await s.repository.change(target(1));
  expect(s.query.update).toHaveBeenCalledWith({ images: [b, a] }); expect(s.query.eq).toHaveBeenCalledWith('id', id(1));
  expect(s.query.filter).toHaveBeenCalledWith('images', 'eq', postgresImageArray([a, b, c])); expect(s.query.select).toHaveBeenCalledWith('id,images');
 });
 it.each([null, { id: id(2), images: [b, a] }, { id: id(1), images: [a, b] }])('refuses missing/wrong-id/wrong-order confirmation (%#)', async data => {
  await expect(adapter(data).repository.change(target(1))).rejects.toThrow();
 });
 it('propagates denied/zero-row errors and refuses a too-large comparison before HTTP', async () => {
  const error = { code: 'PGRST116' }; await expect(adapter(null, error).repository.change(target(1))).rejects.toBe(error);
  const s = adapter(null), expected = Array.from({ length: 50 }, (_, i) => 'https://cdn.invalid/' + 'a'.repeat(200) + i);
  await expect(s.repository.change({ id: id(1), expected, next: expected.slice(1) })).rejects.toThrow(); expect(s.from).not.toHaveBeenCalled();
 });
 it('uses the installed SDK to encode special characters into one exact array predicate', async () => {
  const expected = ['https://cdn.invalid/a,b{c}.jpg', 'https://cdn.invalid/a"quote.jpg', String.raw`https://cdn.invalid/a\back.jpg`, '/عکس.svg?x=1&y=2'];
  const next = [expected[1], expected[0]], requests: URL[] = [];
  const fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
   const url = new URL(String(input)); requests.push(url); expect(init?.method).toBe('PATCH'); expect(JSON.parse(String(init?.body))).toEqual({ images: next });
   return new Response(JSON.stringify({ id: id(1), images: next }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const client = createClient<Database>('https://image-query.invalid', 'sb_publishable_synthetic', { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const result = await createProductImageBatchService(createSupabaseProductImageBatchRepository(client)).update([{ id: id(1), expected, next }], () => true);
  expect(result.succeeded).toEqual([id(1)]);
  expect(requests).toHaveLength(1); expect(requests[0].searchParams.get('images')).toBe('eq.' + postgresImageArray(expected)); expect([...requests[0].searchParams.keys()].sort()).toEqual(['id', 'images', 'select']);
 });
});
describe('image batch preview and shared lock', () => {
 it('changes the cover/order and removes only an explicit reference, then freezes preview until confirmation', async () => {
  const submit = vi.fn().mockResolvedValue({ ...empty, succeeded: [id(1)] }); render(<ProductImageBatchControls selected={[product(1)]} busy={false} submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'ویرایش گروهی تصاویر' })); fireEvent.click(screen.getByLabelText('اصلی‌کردن عکس 2 محصول تصویر 1')); fireEvent.click(screen.getByLabelText('حذف از نمایش عکس 3 محصول تصویر 1'));
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر تصاویر' })); expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toHaveTextContent('قبل'); expect(screen.getByRole('dialog')).toHaveTextContent('بعد');
  fireEvent.click(screen.getByRole('button', { name: 'انصراف' })); expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر تصاویر' })); fireEvent.click(screen.getByRole('button', { name: 'تأیید و اعمال تصاویر' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith([target(1)]));
 });
 it('blocks the last reference, handles duplicate occurrences and supports an explicit draft reset', () => {
  render(<ProductImageBatchControls selected={[product(1, [a, a])]} busy={false} submit={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: 'ویرایش گروهی تصاویر' }));
  fireEvent.click(screen.getByLabelText('حذف از نمایش عکس 1 محصول تصویر 1')); expect(screen.getByLabelText('حذف از نمایش عکس 2 محصول تصویر 1')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('بازنشانی تصاویر محصول تصویر 1')); expect(screen.getByLabelText('حذف از نمایش عکس 1 محصول تصویر 1')).toBeEnabled();
 });
 it('requires explicit reset when a newer list arrives instead of silently reapplying old moves', () => {
  const submit = vi.fn(); const { rerender } = render(<ProductImageBatchControls selected={[product(1)]} busy={false} submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'ویرایش گروهی تصاویر' })); fireEvent.click(screen.getByLabelText('اصلی‌کردن عکس 2 محصول تصویر 1'));
  rerender(<ProductImageBatchControls selected={[product(1, [c, a, b])]} busy={false} submit={submit} />); expect(screen.getByRole('alert')).toHaveTextContent('بازنشانی');
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر تصاویر' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(submit).not.toHaveBeenCalled();
 });
 it('shares a synchronous lock with status, price, category and individual operations', async () => {
  let resolve!: (value: ProductBatchReport) => void; vi.mocked(adminProductImageBatch.update).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result } = renderHook(() => useAdminProducts('A')); await waitFor(() => expect(result.current.products.length).toBe(2));
  let pending!: ReturnType<typeof result.current.bulkImages>;
  await act(async () => { pending = result.current.bulkImages([target(1)]); await result.current.bulkImages([target(1)]); await result.current.bulkStatus([{ id: id(1), expectedActive: true }], false); await result.current.bulkPrices([{ id: id(1), expectedPrice: 10000, nextPrice: 11000 }]); await result.current.bulkCategories([], { department: 'women' }); await result.current.changePrice(id(1), 11000); });
  expect(adminProductImageBatch.update).toHaveBeenCalledTimes(1); expect(adminProductStatus.update).not.toHaveBeenCalled(); expect(adminProductPrices.update).not.toHaveBeenCalled(); expect(adminProductCategories.update).not.toHaveBeenCalled(); expect(adminProducts.changePrice).not.toHaveBeenCalled();
  await act(async () => { resolve({ ...empty, succeeded: [id(1)] }); await pending; }); expect(result.current.batchKind).toBe('images');
 });
 it('ignores the completion and queued lifetime of an old account', async () => {
  let resolve!: (value: ProductBatchReport) => void; vi.mocked(adminProductImageBatch.update).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result, rerender } = renderHook(({ owner }) => useAdminProducts(owner), { initialProps: { owner: 'A' } }); await waitFor(() => expect(result.current.products.length).toBe(2));
  let pending!: ReturnType<typeof result.current.bulkImages>; act(() => { pending = result.current.bulkImages([target(1)]); }); rerender({ owner: 'B' }); rerender({ owner: 'A' });
  expect(vi.mocked(adminProductImageBatch.update).mock.calls[0][1]()).toBe(false);
  await act(async () => { resolve({ ...empty, succeeded: [id(1)] }); await pending; }); expect(toast.success).not.toHaveBeenCalled();
 });
});
