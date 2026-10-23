import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listVariants: vi.fn(), updateVariantField: vi.fn(), addVariant: vi.fn(), deleteVariant: vi.fn(), images: { list: vi.fn(), upload: vi.fn(), removeReference: vi.fn(), removeFile: vi.fn() }, success: vi.fn(), error: vi.fn() }));
vi.mock('./admin', () => ({ adminProducts: mocks, adminProductImages: mocks.images }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { useProductVariants } from './presentation/useProductVariants';
import { useProductImages } from './presentation/useProductImages';
const variant = { id: 'v', product_id: 'p', size: 'M', color: null, sku: null, price: null, stock_quantity: 1, created_at: '2026-01-01' };
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => { vi.clearAllMocks(); mocks.listVariants.mockResolvedValue([variant]); mocks.images.list.mockResolvedValue([{ id: '/old.jpg', image_url: '/old.jpg', product_id: 'p', alt_text: null, sort_order: 0, created_at: '2026-01-01' }]); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('orders variant keystrokes and keeps the newest draft while an earlier write completes', async () => {
 const first = deferred<void>(), second = deferred<void>(); mocks.updateVariantField.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 const h = renderHook(() => useProductVariants('A', 'p')); await waitFor(() => expect(h.result.current.variants).toHaveLength(1));
 await act(async () => { h.result.current.update('v', 'size', 'L'); h.result.current.update('v', 'size', 'XL'); });
 expect(h.result.current.variants[0].size).toBe('XL'); expect(mocks.updateVariantField).toHaveBeenCalledTimes(1);
 await act(async () => { first.resolve(); }); expect(mocks.updateVariantField.mock.calls).toEqual([['v', 'size', 'L'], ['v', 'size', 'XL']]);
 expect(h.result.current.variants[0].size).toBe('XL'); await act(async () => { second.resolve(); }); expect(h.result.current.editing).toBe(false);
});
it('discards queued variant writes when their product form unmounts', async () => {
 const d = deferred<void>(); mocks.updateVariantField.mockReturnValue(d.promise);
 const h = renderHook(() => useProductVariants('A', 'p')); await waitFor(() => expect(h.result.current.variants).toHaveLength(1));
 await act(async () => { h.result.current.update('v', 'size', 'L'); h.result.current.update('v', 'size', 'XL'); });
 h.unmount(); d.resolve(); await act(async () => { await Promise.resolve(); });
 expect(mocks.updateVariantField).toHaveBeenCalledTimes(1); expect(mocks.success).not.toHaveBeenCalled();
});
it('does not let add/delete overwrite an in-flight variant edit and reloads actual values on rejection', async () => {
 const d = deferred<void>(); mocks.updateVariantField.mockReturnValue(d.promise);
 const h = renderHook(() => useProductVariants('A', 'p')); await waitFor(() => expect(h.result.current.variants).toHaveLength(1));
 await act(async () => { h.result.current.update('v', 'size', 'L'); });
 expect(await h.result.current.add({ size: 'S', color: '', price: '', stock_quantity: '1', sku: '' })).toBe(false); await h.result.current.remove('v');
 expect(mocks.addVariant).not.toHaveBeenCalled(); expect(mocks.deleteVariant).not.toHaveBeenCalled();
 await act(async () => { d.reject(Error('denied')); }); await waitFor(() => expect(mocks.listVariants).toHaveBeenCalledTimes(2));
 await waitFor(() => expect(h.result.current.variants[0]?.size).toBe('M'));
});
it('locks image metadata changes against concurrent upload/delete and ignores an old result', async () => {
 const d = deferred<never[]>(); mocks.images.upload.mockReturnValue(d.promise);
 const h = renderHook(() => useProductImages('A', 'p')); await waitFor(() => expect(h.result.current.images).toHaveLength(1)); let pending!: Promise<void>;
 act(() => { pending = h.result.current.upload([new File(['a'], 'a.jpg')]); });
 await h.result.current.remove('/old.jpg'); expect(mocks.images.removeReference).not.toHaveBeenCalled();
 const current = mocks.images.upload.mock.calls[0][3]; expect(current()).toBe(true); h.unmount(); expect(current()).toBe(false);
 d.resolve([]); await pending; expect(mocks.success).not.toHaveBeenCalled();
});
it('does not start storage cleanup after metadata removal completes in a closed form', async () => {
 const d = deferred<void>(); mocks.images.removeReference.mockReturnValue(d.promise);
 const h = renderHook(() => useProductImages('A', 'p')); await waitFor(() => expect(h.result.current.images).toHaveLength(1)); let pending!: Promise<void>;
 act(() => { pending = h.result.current.remove('/old.jpg'); }); h.unmount(); d.resolve(); await pending;
 expect(mocks.images.removeFile).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
});
