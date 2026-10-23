import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), order: vi.fn(), wallet: vi.fn(), owner: 'A', query: 'order_id=old&trans_id=123&id_get=456' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate, useSearchParams: () => [new URLSearchParams(mocks.query)] }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (s: { user: { id: string } }) => unknown) => select({ user: { id: mocks.owner } }) }));
vi.mock('../payments', () => ({ paymentCallbacks: { order: mocks.order, wallet: mocks.wallet } }));
import { usePaymentCallback } from './usePaymentCallback';
const deferred = () => { let resolve!: (path: string) => void; const promise = new Promise<string>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); mocks.owner = 'A'; mocks.query = 'order_id=old&trans_id=123&id_get=456'; });
it('verifies once under StrictMode and navigates only from its active effect', async () => {
 const d = deferred(); mocks.order.mockReturnValue(d.promise);
 const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
 renderHook(() => usePaymentCallback('order'), { wrapper });
 expect(mocks.order).toHaveBeenCalledTimes(1); expect(mocks.order).toHaveBeenCalledWith('old', { trans_id: '123', id_get: '456' });
 await act(async () => { d.resolve('/checkout/failed'); });
 expect(mocks.navigate).toHaveBeenCalledTimes(1); expect(mocks.navigate).toHaveBeenCalledWith('/checkout/failed', { replace: true });
});
it('ignores a callback completed after the account changes', async () => {
 const old = deferred(), next = deferred(); mocks.order.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
 const h = renderHook(() => usePaymentCallback('order')); mocks.owner = 'B'; h.rerender();
 await act(async () => { old.resolve('/old'); }); expect(mocks.navigate).not.toHaveBeenCalled();
 await act(async () => { next.resolve('/current'); }); expect(mocks.navigate).toHaveBeenCalledWith('/current', { replace: true });
});
it('ignores changed callback parameters and work after unmount', async () => {
 const old = deferred(), next = deferred(); mocks.order.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
 const h = renderHook(() => usePaymentCallback('order')); mocks.query = 'order_id=new'; h.rerender();
 await act(async () => { old.resolve('/old'); }); expect(mocks.navigate).not.toHaveBeenCalled(); h.unmount();
 await act(async () => { next.resolve('/new'); }); expect(mocks.navigate).not.toHaveBeenCalled();
});
