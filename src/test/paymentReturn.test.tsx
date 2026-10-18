import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { authPath, authReturn } from "@/lib/authReturn";
const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown>, login: vi.fn(), otp: vi.fn(), request: vi.fn(), getSession: vi.fn() }));
vi.mock("@/stores/authStore", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector(mocks.state) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import RequireAuth from "@/components/auth/RequireAuth";
import RedirectIfAuthenticated from "@/components/auth/RedirectIfAuthenticated";
import SignIn from "@/pages/SignIn";
import OtpRequest from "@/pages/OtpRequest";
import OtpVerify from "@/pages/OtpVerify";
import CheckoutVerify from "@/pages/checkout/CheckoutVerify";
import WalletVerify from "@/pages/account/WalletVerify";

function Location() { const location = useLocation(); return <><output>{location.pathname + location.search}</output><Outlet /></>; }
function app(entry: string) {
  return <MemoryRouter initialEntries={[entry]}><Routes><Route element={<Location />}>
    <Route element={<RedirectIfAuthenticated />}>
      <Route path="/signin" element={<SignIn />} /><Route path="/signin/otp" element={<OtpRequest />} />
      <Route path="/signin/otp/verify" element={<OtpVerify />} />
    </Route>
    <Route element={<RequireAuth />}>
      <Route path="/checkout/verify" element={<CheckoutVerify />} />
      <Route path="/account/wallet/verify" element={<WalletVerify />} />
    </Route><Route path="*" element={<div>result</div>} />
  </Route></Routes></MemoryRouter>;
}
beforeEach(() => {
  vi.resetAllMocks();
  const login = async () => { mocks.state.session = { expiresAt: Date.now() + 60000 }; mocks.state.user = { id: "customer" }; };
  mocks.login.mockImplementation(login); mocks.otp.mockImplementation(login);
  mocks.request.mockResolvedValue({ expiresInSeconds: 60 });
  mocks.state = { session: null, user: null, isBootstrapping: false, bootstrap: vi.fn(), signInWithPassword: mocks.login, verifyOtp: mocks.otp, requestOtp: mocks.request };
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "synthetic-token" } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, reason: "verification_failed" }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("logged-out payment returns", () => {
  it.each([
    ["/checkout/verify", "order_id", "/api/bitpay/verify"],
    ["/account/wallet/verify", "topup_id", "/api/bitpay/wallet-verify"],
  ])("preserves %s query through password login and uses server result", async (path, key, endpoint) => {
    const callback = `${path}?${key}=legacy%26id&id_get=ref%2B1&trans_id=trans%2F1&success=true`;
    render(app(callback));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(authPath("/signin", callback)));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(document.querySelector('input[autocomplete="tel"]')!, { target: { value: "09110000001" } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: "test-password" } });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ body: JSON.stringify({ [key]: "legacy&id", trans_id: "trans/1", id_get: "ref+1" }) }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain(path.startsWith("/checkout") ? "/checkout/failed" : "topup=failed"));
  });
  it("preserves callback across OTP selection, request and verification", async () => {
    const callback = "/checkout/verify?order_id=old&id_get=ref&trans_id=trans";
    render(app(callback));
    fireEvent.click(await screen.findByRole("link", { name: /یک.بار/ }));
    fireEvent.change(document.querySelector('input[autocomplete="tel"]')!, { target: { value: "09110000001" } });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(document.querySelector("#otp")).not.toBeNull());
    fireEvent.change(document.querySelector("#otp")!, { target: { value: "123456" } });
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(mocks.otp).toHaveBeenCalledWith("+989110000001", "123456");
  });
  it("retains callback on a reloaded auth route when already logged in", async () => {
    await mocks.login();
    render(app(authPath("/signin", "/account/wallet/verify?topup_id=old&id_get=ref&trans_id=trans")));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/bitpay/wallet-verify", expect.anything()));
  });
  it.each(["https://evil.invalid", "//evil.invalid/checkout/verify", "/checkout/verify/../success", "/admin", "/checkout/success?paid=true", "/checkout/verify\\evil", "/signin"])("rejects unsafe/unrelated destination %s", candidate => {
    expect(authReturn(`?${new URLSearchParams({ returnTo: candidate })}`)).toBe("/account");
  });
});
