import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const m = vi.hoisted(() => ({ getSession: vi.fn(), clearCart: vi.fn(), clearCheckout: vi.fn(), items: [] as unknown[], userId: 'customer' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: m.getSession } } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: Object.assign((select: (s: unknown) => unknown) => select({ user: { id: m.userId } }), { getState: () => ({ user: { id: m.userId } }) }) }));
vi.mock('@/stores/cartStore', () => ({ useCartStore: { getState: () => ({ items: m.items, clearCart: m.clearCart }) } }));
vi.mock('@/stores/checkoutStore', () => ({ useCheckoutStore: { getState: () => ({ clearCheckout: m.clearCheckout }) } }));
import CheckoutSuccess from '@/pages/checkout/CheckoutSuccess';
const id = '10000000-0000-0000-0000-000000000001';
const item = { productId: 'p', quantity: 2, selectedSize: 'M', selectedColor: null };
function snapshot(orderId = id) { sessionStorage.setItem('trusted-checkout:customer', JSON.stringify({ orderId, selection: JSON.stringify({ items: [{ productId: 'p', quantity: 2, size: 'M', color: null }] }) })); }
function app(query = '?order=' + id) { render(<MemoryRouter initialEntries={['/checkout/success' + query]}><CheckoutSuccess /></MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); m.items = [item]; m.userId = 'customer';
  m.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic', user: { id: 'customer' } } } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ orderId: id, paid: true }) })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('authoritative checkout receipt', () => {
  it.each(['', '?order=forged&paid=true'])('never trusts an invalid success URL %s', async query => { snapshot(); app(query); await screen.findByText('وضعیت پرداخت قابل بررسی نیست'); expect(fetch).not.toHaveBeenCalled(); expect(m.clearCart).not.toHaveBeenCalled(); });
  it('shows success and clears only the matching cart after authenticated server confirmation', async () => { snapshot(); app(); await screen.findByText('پرداخت با موفقیت انجام شد'); expect(m.clearCart).toHaveBeenCalledOnce(); expect(m.clearCheckout).toHaveBeenCalledOnce(); expect(sessionStorage.getItem('trusted-checkout:customer')).toBeNull(); });
  it.each([false, 'true'])('does not clear on an unpaid or malformed response %s', async paid => { snapshot(); vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ orderId: id, paid }) } as Response); app(); await waitFor(() => expect(screen.queryByText('در حال بررسی وضعیت سفارش...')).toBeNull()); expect(m.clearCart).not.toHaveBeenCalled(); });
  it('preserves a different/new cart even when the old order is paid', async () => { snapshot(); m.items = [{ ...item, quantity: 3 }]; app(); await screen.findByText('پرداخت با موفقیت انجام شد'); expect(m.clearCart).not.toHaveBeenCalled(); });
  it('preserves the cart on timeout/network failure or mismatched order identity', async () => { snapshot(); vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ orderId: 'different', paid: true }) } as Response); app(); await screen.findByText('وضعیت پرداخت قابل بررسی نیست'); expect(m.clearCart).not.toHaveBeenCalled(); });
  it('does not reuse a session for another account', async () => { m.userId = 'another'; app(); await screen.findByText('وضعیت پرداخت قابل بررسی نیست'); expect(fetch).not.toHaveBeenCalled(); });
  it('does not clear a later cart after revisiting an already consumed receipt', async () => { snapshot(); app(); await screen.findByText('پرداخت با موفقیت انجام شد'); cleanup(); m.clearCart.mockClear(); app(); await screen.findByText('پرداخت با موفقیت انجام شد'); expect(m.clearCart).not.toHaveBeenCalled(); });
});
