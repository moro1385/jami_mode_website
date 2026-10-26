import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AdminProduct } from './domain/adminProducts';
import type { ProductBatchReport } from './application/productBatch';
import { previewProductPrices, validatePriceBatch, MAX_BASE_PRICE } from './domain/productPrices';
import { createProductPriceService } from './application/productPriceService';
import { createSupabaseProductPriceRepository } from './infrastructure/supabaseProductPriceRepository';
import { ProductPriceBatchControls } from './presentation/ProductPriceBatchControls';
import { useAdminProducts } from './presentation/useAdminProducts';
import { adminProductPrices, adminProductStatus, adminProducts } from './admin';
import { toast } from 'sonner';
vi.mock('./admin', () => ({ adminProducts: { listProducts: vi.fn(), changePrice: vi.fn() }, adminProductPrices: { update: vi.fn() }, adminProductStatus: { update: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const id = (index: number) => '84000000-0000-4000-8000-' + String(index).padStart(12, '0');
const target = (index: number, expectedPrice = 10000, nextPrice = 11000) => ({ id: id(index), expectedPrice, nextPrice });
const product = (index: number, price = 10000) => ({ id: id(index), name: 'کالای قیمت ' + index, slug: 'price-' + index, price, is_active: true } as AdminProduct);
const empty: ProductBatchReport = { succeeded: [], unchanged: [], failed: [], unattempted: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(adminProducts.listProducts).mockResolvedValue([product(1), product(2)]); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('explicit integer-rial price previews', () => {
 it('accepts Persian and Arabic digits for fixed prices without altering selection', () => {
  const products = [product(1, 0), product(2)];
  expect(previewProductPrices(products, 'fixed', ' ۵۰۰۰۰ ')).toEqual([target(1, 0, 50000), target(2, 10000, 50000)]);
  expect(previewProductPrices(products, 'fixed', '٥٠٠٠٠')[0].nextPrice).toBe(50000);
  expect(products[1].price).toBe(10000);
 });
 it('computes percentage changes with exact basis points and rounds half up to an integer rial', () => {
  expect(previewProductPrices([product(1, 150)], 'increase', '۱٫۲۵')[0].nextPrice).toBe(152);
  expect(previewProductPrices([product(1, 101)], 'decrease', '50')[0].nextPrice).toBe(51);
  expect(previewProductPrices([product(1, 10000)], 'increase', '0.29')[0].nextPrice).toBe(10029);
  expect(previewProductPrices([product(1)], 'decrease', '0')[0]).toEqual(target(1, 10000, 10000));
 });
 it.each(['0', '-1', '1.5', '1e4', '12,34', '100000000', 'NaN', 'Infinity', ''])('refuses invalid fixed prices: %s', input => {
  expect(() => previewProductPrices([product(1)], 'fixed', input)).toThrow();
 });
 it.each(['100.01', '-10', '1.234', '1e2'])('refuses unsupported percentages: %s', input => {
  expect(() => previewProductPrices([product(1)], 'increase', input)).toThrow();
 });
 it('refuses zero results, overflow and invalid stored fractional prices instead of silently changing policy', () => {
  expect(() => previewProductPrices([product(1)], 'decrease', '100')).toThrow();
  expect(() => previewProductPrices([product(1, MAX_BASE_PRICE)], 'increase', '1')).toThrow();
  expect(() => previewProductPrices([product(1, 1.2)], 'fixed', '100')).toThrow();
 });
 it('rejects duplicates, empty/oversized batches and strips unrelated fields', () => {
  expect(() => validatePriceBatch([])).toThrow();
  expect(() => validatePriceBatch([target(1), target(1)])).toThrow();
  expect(() => validatePriceBatch(Array.from({ length: 51 }, (_, i) => target(i)))).toThrow();
  const input = [{ ...target(1), is_active: false, stock_quantity: 0 }];
  expect(validatePriceBatch(input)).toEqual([target(1)]);
 });
});
describe('batch price dispatch', () => {
 it('freezes the exact displayed old/new values and skips no-ops', async () => {
  const change = vi.fn().mockResolvedValue(undefined), service = createProductPriceService({ change });
  const targets = [target(1), target(2, 10000, 10000)];
  expect(await service.update(targets, () => true)).toEqual({ ...empty, succeeded: [id(1)], unchanged: [id(2)] });
  expect(change).toHaveBeenCalledExactlyOnceWith(target(1));
 });
 it('stops on unconfirmed writes, retains earlier success and does not dispatch later products', async () => {
  const change = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('conflict'));
  expect(await createProductPriceService({ change }).update([target(1), target(2), target(3)], () => true)).toEqual({ ...empty, succeeded: [id(1)], failed: [id(2)], unattempted: [id(3)] });
  expect(change).toHaveBeenCalledTimes(2);
 });
 it('stops queued writes on lifetime change and rejects invalid values without a request', async () => {
  let active = true; const change = vi.fn().mockImplementation(async () => { active = false; });
  const service = createProductPriceService({ change });
  expect((await service.update([target(1), target(2)], () => active)).unattempted).toEqual([id(2)]);
  await expect(service.update([target(1, 10000, 0)], () => true)).rejects.toThrow(); expect(change).toHaveBeenCalledTimes(1);
 });
});
function adapter(data: unknown, error: unknown = null) {
 const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data, error }) };
 const from = vi.fn().mockReturnValue(query);
 return { query, from, service: createSupabaseProductPriceRepository({ from } as unknown as Pick<SupabaseClient<Database>, 'from'>) };
}
describe('confirmed base-price adapter', () => {
 it('writes only price and requires the previewed price plus exact product id', async () => {
  const a = adapter({ id: id(1), price: 11000 }); await a.service.change(target(1));
  expect(a.from).toHaveBeenCalledWith('products'); expect(a.query.update).toHaveBeenCalledWith({ price: 11000 });
  expect(a.query.eq.mock.calls).toEqual([['id', id(1)], ['price', 10000]]);
  expect(a.query.select).toHaveBeenCalledWith('id,price'); expect(a.query.abortSignal).toHaveBeenCalled();
 });
 it.each([null, { id: id(2), price: 11000 }, { id: id(1), price: 10000 }])('refuses absent/mismatched confirmations (%#)', async data => {
  await expect(adapter(data).service.change(target(1))).rejects.toThrow();
 });
 it('propagates stale-price zero-row and permission failures', async () => {
  const error = { code: 'PGRST116' }; await expect(adapter(null, error).service.change(target(1))).rejects.toBe(error);
 });
});
describe('price batch UI and shared operation lock', () => {
 it('does not write before confirmation and cancelling the preview sends nothing', () => {
  const submit = vi.fn(); render(<ProductPriceBatchControls selected={[product(1)]} busy={false} submit={submit} />);
  fireEvent.change(screen.getByLabelText('مقدار تغییر قیمت'), { target: { value: '۵۰۰۰۰' } });
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر قیمت' }));
  expect(screen.getByText('۱۰٬۰۰۰ ریال')).toBeInTheDocument(); expect(screen.getByText('۵۰٬۰۰۰ ریال')).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'انصراف' })); expect(submit).not.toHaveBeenCalled();
 });
 it('shows validation errors without enabling a destructive/free-price confirmation', () => {
  const submit = vi.fn(); render(<ProductPriceBatchControls selected={[product(1)]} busy={false} submit={submit} />);
  fireEvent.change(screen.getByLabelText('مقدار تغییر قیمت'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر قیمت' }));
  expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(submit).not.toHaveBeenCalled();
 });
 it('confirms the frozen preview even if backing list props change', async () => {
  const submit = vi.fn().mockResolvedValue({ ...empty, succeeded: [id(1)] });
  const { rerender } = render(<ProductPriceBatchControls selected={[product(1)]} busy={false} submit={submit} />);
  fireEvent.change(screen.getByLabelText('روش تغییر قیمت گروهی'), { target: { value: 'increase' } });
  fireEvent.change(screen.getByLabelText('مقدار تغییر قیمت'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش تغییر قیمت' }));
  rerender(<ProductPriceBatchControls selected={[product(1, 20000)]} busy={false} submit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'تأیید و اعمال قیمت' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith([target(1)]));
 });
 it('shares the immediate lock with status batches and individual writes', async () => {
  let resolve!: (value: ProductBatchReport) => void;
  vi.mocked(adminProductPrices.update).mockReturnValue(new Promise(done => { resolve = done; }));
  const { result } = renderHook(() => useAdminProducts('A')); await waitFor(() => expect(result.current.products.length).toBe(2));
  let pending!: ReturnType<typeof result.current.bulkPrices>;
  await act(async () => { pending = result.current.bulkPrices([target(1)]); await result.current.bulkPrices([target(1)]); await result.current.bulkStatus([{ id: id(1), expectedActive: true }], false); await result.current.changePrice(id(1), 1); });
  expect(adminProductPrices.update).toHaveBeenCalledTimes(1); expect(adminProductStatus.update).not.toHaveBeenCalled(); expect(adminProducts.changePrice).not.toHaveBeenCalled();
  await act(async () => { resolve({ ...empty, succeeded: [id(1)] }); await pending; });
  expect(result.current.batchKind).toBe('price'); expect(result.current.busy).toBe(false);
 });
 it('rejects a locally stale preview before dispatch and ignores old-account completion', async () => {
  const { result, rerender } = renderHook(({ owner }) => useAdminProducts(owner), { initialProps: { owner: 'A' } });
  await waitFor(() => expect(result.current.products.length).toBe(2));
  await act(async () => { await result.current.bulkPrices([target(1, 20000, 30000)]); });
  expect(adminProductPrices.update).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.loading).toBe(false));
  let resolve!: (value: ProductBatchReport) => void; vi.mocked(adminProductPrices.update).mockReturnValue(new Promise(done => { resolve = done; }));
  let pending!: ReturnType<typeof result.current.bulkPrices>; act(() => { pending = result.current.bulkPrices([target(1)]); });
  rerender({ owner: 'B' }); rerender({ owner: 'A' });
  expect(vi.mocked(adminProductPrices.update).mock.calls[0][1]()).toBe(false);
  await act(async () => { resolve({ ...empty, succeeded: [id(1)] }); await pending; }); expect(toast.success).not.toHaveBeenCalled();
 });
});
