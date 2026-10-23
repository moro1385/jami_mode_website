import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({
  from: vi.fn(), orderInsert: vi.fn(), itemInsert: vi.fn(), single: vi.fn(), navigate: vi.fn(),
  bootstrap: vi.fn(), getSession: vi.fn(), toastError: vi.fn(),
  user: { id: "customer", wallet: { balance: 5000, currencyCode: "IRR", transactions: [] } },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, auth: { getSession: mocks.getSession } } }));
vi.mock("@/stores/authStore", () => ({ useAuthStore: Object.assign(
  (select: (state: { user: typeof mocks.user }) => unknown) => select({ user: mocks.user }),
  { getState: () => ({ bootstrap: mocks.bootstrap, user: mocks.user }) },
) }));
vi.mock("@/components/account/AccountLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock("react-router-dom", async (importOriginal) => ({ ...await importOriginal<typeof import("react-router-dom")>(), useNavigate: () => mocks.navigate }));
import CheckoutPayment from "@/pages/checkout/CheckoutPayment";
import Wallet from "@/pages/account/Wallet";
import WalletVerify from "@/pages/account/WalletVerify";
import { useCartStore } from "@/stores/cartStore";
import { useCheckoutStore } from "@/stores/checkoutStore";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); }));
  mocks.single.mockResolvedValue({ data: { id: "new-order" }, error: null });
  mocks.orderInsert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.itemInsert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === "orders") return { insert: mocks.orderInsert };
    if (table === "order_items") return { insert: mocks.itemInsert };
    throw new Error(`Forbidden client financial access: ${table}`);
  });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "synthetic-token", user: { id: "customer" } } } });
  useCartStore.setState({ items: [{ id: "cart-line", productId: "catalog-product", productTitle: "Test product", productHandle: "test", image: "", price: { amount: "1000", currencyCode: "IRR" }, quantity: 1, selectedSize: null, selectedColor: null }] });
  useCheckoutStore.setState({ selectedAddress: { id: "address", label: "Home", recipient: "Customer", phone: "09110000001", country: "Iran", city: "Tehran", line1: "Test street", postalCode: "0000000000", isDefault: true }, shippingMethod: "post", shippingCost: 100 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const checkout = () => render(<MemoryRouter><CheckoutPayment /></MemoryRouter>);

describe("customer financial UI containment", () => {
  it("disables wallet checkout even when there is enough balance", () => {
    checkout();
    const wallet = screen.getByRole("button", { name: /پرداخت از کیف پول/ });
    expect(wallet).toBeDisabled();
    fireEvent.click(wallet);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toHaveLength(1);
  });
  it("offers no top-up action while server activation is disabled", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ balance: 5000, currency: "IRR", entries: [], pendingTopups: [], hasMore: false, topupsEnabled: false, spendingEnabled: false }) } as Response);
    render(<MemoryRouter><Wallet /></MemoryRouter>);
    expect(await screen.findByText("شارژ جدید کیف پول موقتاً غیرفعال است.")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /شارژ/ })).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/wallet/summary", expect.objectContaining({ method: "GET", cache: "no-store" }));
  });
  it("requests a trusted quote without direct financial writes and retains cart on failure", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "mock gateway unavailable" }) } as Response);
    checkout();
    fireEvent.click(screen.getByRole("button", { name: /\u062f\u0631\u06af\u0627\u0647/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/bitpay/checkout/quote', expect.objectContaining({
      body: expect.stringContaining('"selection"'),
    }));
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.selection).toEqual({ addressId: 'address', shippingOption: 'post', items: [{ productId: 'catalog-product', quantity: 1, size: null, color: null }] });
    expect(mocks.from).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(useCartStore.getState().items).toHaveLength(1);
  });
  it("requires a separate confirmation of server totals and reuses the checkout key", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ quote: 'server-hash', total: 9000, shipping: 2000 }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ orderId: '71000000-0000-4000-8000-000000000002', total: 9000, shipping: 2000 }) } as Response)
      .mockResolvedValue({ ok: false, json: async () => ({ error: 'provider disabled' }) } as Response);
    checkout();
    const button = screen.getByRole('button', { name: /\u062f\u0631\u06af\u0627\u0647/ });
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const first = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const second = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.quote).toBe('server-hash');
    expect(fetch).toHaveBeenLastCalledWith('/api/bitpay/init', expect.objectContaining({ body: JSON.stringify({ orderId: '71000000-0000-4000-8000-000000000002' }) }));
    expect(mocks.from).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toHaveLength(1);
  });
  it("preserves the browser verification route for previously initiated topups", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
    render(<MemoryRouter initialEntries={["/account/wallet/verify?topup_id=old-topup&id_get=old-ref&trans_id=old-trans"]}><WalletVerify /></MemoryRouter>);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/account/wallet?topup=pending&topupId=old-topup", { replace: true }));
    expect(fetch).toHaveBeenCalledWith("/api/bitpay/wallet-verify", expect.objectContaining({ body: JSON.stringify({ topup_id: "old-topup", trans_id: "old-trans", id_get: "old-ref" }) }));
  });
});
