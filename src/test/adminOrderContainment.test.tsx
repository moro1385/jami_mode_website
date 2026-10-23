import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/components/shared/OrderDetailsDialog", () => ({ OrderDetailsDialog: () => null }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children, disabled }: { value: string; onValueChange: (value: string) => void; children: ReactNode; disabled?: boolean }) =>
    <select disabled={disabled} value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock("@/stores/authStore", () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: "synthetic-admin" } }) }));
import AdminOrders from "@/pages/admin/AdminOrders";

beforeEach(() => {
  vi.resetAllMocks();
  const order = { id: "order-id", created_at: "2026-01-01", status: "confirmed", total_amount: 1000, shipping_cost: 0, payment_method: "gateway", profiles: null };
  let requestedStatus = order.status;
  const chain = { eq: mocks.eq, select: () => ({ single: async () => { const result = await mocks.single(); if (result.data && !result.error) order.status = requestedStatus; return result; } }) };
  mocks.eq.mockReturnValue(chain);
  mocks.update.mockImplementation((patch: { status: string }) => { requestedStatus = patch.status; return chain; });
  mocks.from.mockReturnValue({ update: mocks.update, select: () => ({ order: async () => ({ data: [order], error: null }) }) });
});
afterEach(cleanup);

describe("admin status persistence under restrictive RLS", () => {
  it.each(["pending_payment", "payment_failed", "pending", "cancelled", "unknown"])("renders %s without offering payment/fulfillment mutation", async status => {
    mocks.from.mockReturnValue({ select: () => ({ order: async () => ({ data: [{ id: "order-id", created_at: "2026-01-01", status, total_amount: 1000, profiles: null }], error: null }) }) });
    render(<AdminOrders />);
    expect(await screen.findByRole("combobox")).toHaveValue(status);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { message: "permission denied", code: "42501" } },
  ])("does not report success for a denied/zero-row update ($error)", async result => {
    mocks.single.mockResolvedValue(result);
    render(<AdminOrders />);
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "shipped" } });
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("confirmed"));
  });
  it("retains success for an authorized persisted admin update", async () => {
    mocks.single.mockResolvedValue({ data: { id: "order-id" }, error: null });
    render(<AdminOrders />);
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "shipped" } });
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ status: "shipped" });
    expect(mocks.eq).toHaveBeenCalledWith("status", "confirmed");
    expect(screen.getByRole("combobox")).toHaveValue("shipped");
  });
});
