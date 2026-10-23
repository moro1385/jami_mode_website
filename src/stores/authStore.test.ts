import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
  signUp: vi.fn(), signInWithPassword: vi.fn(), verifyOtp: vi.fn(), getSession: vi.fn(), signOut: vi.fn(),
  onAuthStateChange: vi.fn(), completePendingSignup: vi.fn(), saveProfileEdits: vi.fn(), flushCartToServer: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, auth: mocks } }));
vi.mock("@/lib/profileWrites", () => ({ completePendingSignup: mocks.completePendingSignup, saveProfileEdits: mocks.saveProfileEdits }));
vi.mock("@/lib/cartSync", () => ({ flushCartToServer: mocks.flushCartToServer }));
import { useAuthStore } from "./authStore";
import type { User } from "@/types/auth";
const authListener = mocks.onAuthStateChange.mock.calls[0][0];
afterEach(() => vi.useRealTimers());

const customer: User = { id: "customer", phone: "+989110000001", firstName: "Before", lastName: "Name", createdAt: "2026-01-01", addresses: [], wallet: { balance: 5000, currencyCode: "IRR", transactions: [] }, orders: [] };
const session = { token: "synthetic-token", userId: customer.id, expiresAt: Date.now() + 60000 };
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useAuthStore.setState({ user: customer, session });
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.saveProfileEdits.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("auth store compatibility", () => {
  it("stores phone-bound pending names before signup can emit an auth event", async () => {
    mocks.signUp.mockImplementation(async () => {
      expect(JSON.parse(sessionStorage.getItem("jamimode-pending-signup")!)).toEqual({ phone: "+989110000001", firstName: "New", lastName: "Name" });
      return { data: { user: { id: "new" }, session: null }, error: null };
    });
    await useAuthStore.getState().signUp({ phone: "09110000001", firstName: "New", lastName: "Name", password: "synthetic-password" });
    expect(mocks.signUp).toHaveBeenCalledWith({ phone: "+989110000001", password: "synthetic-password", options: { data: { first_name: "New", last_name: "Name" } } });
  });
  it("persists signup names with Auth before any authenticated profile save is possible", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "new" }, session: null }, error: null });
    await useAuthStore.getState().signUp({ phone: "09110000001", firstName: "New", lastName: "Name", password: "synthetic-password" });
    expect(mocks.signUp).toHaveBeenCalledWith({ phone: "+989110000001", password: "synthetic-password", options: { data: { first_name: "New", last_name: "Name" } } });
  });
  it("clears its pending names on signup rejection", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: { message: "signup denied" } });
    await expect(useAuthStore.getState().signUp({ phone: "09110000001", firstName: "New", lastName: "Name", password: "synthetic-password" })).rejects.toThrow("signup denied");
    expect(sessionStorage.getItem("jamimode-pending-signup")).toBeNull();
  });
  it("clears pending names when signup throws a transport error", async () => {
    mocks.signUp.mockRejectedValueOnce(new Error("offline"));
    await expect(useAuthStore.getState().signUp({ phone: "09110000001", firstName: "New", lastName: "Name", password: "synthetic-password" })).rejects.toThrow("offline");
    expect(sessionStorage.getItem("jamimode-pending-signup")).toBeNull();
  });
  it("does not copy another customer's balance or addresses into an immediate signup session", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "new-customer", created_at: "2026-01-01" }, session: { access_token: "new-token", user: { id: "new-customer" } } }, error: null });
    await useAuthStore.getState().signUp({ phone: "09110000002", firstName: "New", lastName: "Name", password: "synthetic-password" });
    expect(useAuthStore.getState().user?.id).toBe("new-customer");
    expect(useAuthStore.getState().user?.wallet).toEqual({ balance: 0, currencyCode: "IRR", transactions: [] });
    expect(useAuthStore.getState().user?.addresses).toEqual([]);
  });
  it("rejects a profile edit without an active account instead of reporting success", async () => {
    useAuthStore.setState({ user: null, session: null });
    await expect(useAuthStore.getState().updateProfile({ firstName: "After" })).rejects.toThrow("Sign in");
    expect(mocks.saveProfileEdits).not.toHaveBeenCalled();
  });
  it("keeps saved user state unchanged on a denied profile save", async () => {
    mocks.saveProfileEdits.mockRejectedValueOnce(new Error("denied"));
    await expect(useAuthStore.getState().updateProfile({ firstName: "After" })).rejects.toThrow("denied");
    expect(useAuthStore.getState().user).toEqual(customer);
  });
  it("merges only allowed edits after persistence, preserving wallet balance", async () => {
    await useAuthStore.getState().updateProfile({ firstName: "After", wallet: { balance: 999999 } } as Parameters<ReturnType<typeof useAuthStore.getState>["updateProfile"]>[0]);
    expect(useAuthStore.getState().user?.firstName).toBe("After");
    expect(useAuthStore.getState().user?.wallet.balance).toBe(5000);
  });
  it("preserves OTP authentication calls", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    await useAuthStore.getState().verifyOtp("09110000001", "123456");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ phone: "+989110000001", token: "123456", type: "sms" });
  });
  it("preserves password authentication error handling", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "invalid credentials" } });
    await expect(useAuthStore.getState().signInWithPassword("09110000001", "synthetic-password")).rejects.toThrow("invalid credentials");
  });
  it("preserves signout and clears local authentication", async () => {
    await useAuthStore.getState().signOut();
    expect(mocks.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
  it("defers profile requests until the auth event callback has returned", async () => {
    vi.useFakeTimers();
    mocks.completePendingSignup.mockResolvedValue(null);
    const profile = { data: { first_name: "Loaded", wallet_balance: 5000 }, error: null };
    mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === "profiles" ? { single: async () => profile } : Promise.resolve({ data: [], error: null }) }) }));
    const result = authListener("SIGNED_IN", { access_token: "test", expires_in: 3600, user: { id: "customer", phone: "+989110000001", created_at: "2026-01-01" } });
    expect(result).toBeUndefined();
    expect(mocks.completePendingSignup).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(useAuthStore.getState().user?.firstName).toBe("Loaded");
  });
  it("does not restore a queued signed-in session after a signout event", async () => {
    vi.useFakeTimers();
    authListener("SIGNED_IN", { access_token: "test", user: { id: "customer" } });
    authListener("SIGNED_OUT", null);
    await vi.runAllTimersAsync();
    expect(mocks.completePendingSignup).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });
  it("does not restore a session if signout happens during bootstrap", async () => {
    const oldSession = { access_token: "test", user: { id: "customer", phone: "+989110000001", created_at: "2026-01-01" } };
    mocks.getSession.mockResolvedValue({ data: { session: oldSession }, error: null });
    let finishProfile: (value: unknown) => void;
    const profile = new Promise(resolve => { finishProfile = resolve; });
    mocks.completePendingSignup.mockResolvedValue(null);
    mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === "profiles" ? { single: () => profile } : Promise.resolve({ data: [], error: null }) }) }));
    const bootstrapping = useAuthStore.getState().bootstrap();
    await Promise.resolve(); await Promise.resolve();
    authListener("SIGNED_OUT", null);
    finishProfile!({ data: { first_name: "Stale" }, error: null });
    await bootstrapping;
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

// Regression: switching between existing accounts must not carry cached orders.
it('does not carry cached orders across a password login to another account', async () => {
  useAuthStore.setState({ user: { ...customer, orders: [{ id: 'private-old-order' }] as User['orders'] } });
  mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'other', created_at: '2026-01-01' }, session: { access_token: 'synthetic', user: { id: 'other' } } }, error: null });
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'profiles' ? { single: async () => ({ data: {}, error: null }) } : Promise.resolve({ data: [], error: null }) }) }));
  await useAuthStore.getState().signInWithPassword('09110000002', 'synthetic');
  expect(useAuthStore.getState().user?.id).toBe('other'); expect(useAuthStore.getState().user?.orders).toEqual([]);
});

it('clears a previous account immediately when a different Auth identity arrives', async () => {
  vi.useFakeTimers(); mocks.completePendingSignup.mockResolvedValue(null);
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'profiles' ? { single: async () => ({ data: {}, error: null }) } : Promise.resolve({ data: [], error: null }) }) }));
  authListener('SIGNED_IN', { access_token: 'synthetic', user: { id: 'other', created_at: '2026-01-01' } });
  expect(useAuthStore.getState().user).toBeNull();
  await vi.runAllTimersAsync(); expect(useAuthStore.getState().user?.id).toBe('other'); expect(useAuthStore.getState().user?.orders).toEqual([]);
});
it('retains same-account order cache on token refresh', async () => {
  vi.useFakeTimers(); mocks.completePendingSignup.mockResolvedValue(null);
  const orders = [{ id: 'same-account-order' }] as User['orders']; useAuthStore.setState({ user: { ...customer, orders } });
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'profiles' ? { single: async () => ({ data: {}, error: null }) } : Promise.resolve({ data: [], error: null }) }) }));
  authListener('TOKEN_REFRESHED', { access_token: 'synthetic', user: { id: customer.id, created_at: '2026-01-01' } });
  await vi.runAllTimersAsync(); expect(useAuthStore.getState().user?.orders).toEqual(orders);
});
it('does not restore a previous account when an address deletion finishes late', async () => {
  let complete: (value: unknown) => void = () => {};
  const request = new Promise(resolve => { complete = resolve; });
  const address = { id: 'owned-old-address', label: 'home', recipient: 'Name', phone: '', country: '', city: '', line1: '', postalCode: '', isDefault: true };
  useAuthStore.setState({ user: { ...customer, addresses: [address] } });
  const chain = { eq: () => chain, select: () => ({ single: () => request }) };
  mocks.from.mockImplementation(() => ({ delete: () => chain, select: () => ({ eq: async () => ({ data: [], error: null }) }) }));
  const deleting = useAuthStore.getState().deleteAddress(address.id);
  useAuthStore.setState({ user: { ...customer, id: 'other' } }); complete({ data: { id: address.id }, error: null }); await deleting;
  expect(useAuthStore.getState().user?.id).toBe('other');
});
it('a slower password sign-in cannot overwrite a later sign-in', async () => {
  let complete: (value: unknown) => void = () => {};
  const older = new Promise(resolve => { complete = resolve; });
  const result = (id: string) => ({ data: { user: { id, created_at: '2026-01-01' }, session: { access_token: 'synthetic', user: { id } } }, error: null });
  mocks.signInWithPassword.mockReturnValueOnce(older).mockResolvedValueOnce(result('latest'));
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'profiles' ? { single: async () => ({ data: {}, error: null }) } : Promise.resolve({ data: [], error: null }) }) }));
  const previous = useAuthStore.getState().signInWithPassword('09110000001', 'synthetic');
  await useAuthStore.getState().signInWithPassword('09110000002', 'synthetic'); complete(result('previous')); await previous;
  expect(useAuthStore.getState().user?.id).toBe('latest');
});

describe('persisted address store outcomes', () => {
  const address = { id: 'owned', label: 'home', recipient: 'Name', phone: '', country: '', city: '', line1: '', postalCode: '', isDefault: true };
  it('rejects unsigned address changes', async () => {
    useAuthStore.setState({ user: null, session: null });
    await expect(useAuthStore.getState().upsertAddress(address)).rejects.toThrow('Sign in');
  });
  it('reloads actual addresses after a denied delete and still rejects the action', async () => {
    useAuthStore.setState({ user: { ...customer, addresses: [address] } });
    const chain = { eq: () => chain, select: () => ({ single: async () => ({ data: null, error: Error('denied') }) }) };
    mocks.from.mockImplementation(() => ({ delete: () => chain, select: () => ({ eq: async () => ({ data: [{ ...address, label: 'persisted', postal_code: '', is_default: true }], error: null }) }) }));
    await expect(useAuthStore.getState().deleteAddress(address.id)).rejects.toThrow('denied');
    expect(useAuthStore.getState().user?.addresses[0].label).toBe('persisted');
    expect(useAuthStore.getState().user?.wallet.balance).toBe(customer.wallet.balance);
  });
  it('keeps the last known state if mutation and recovery read both fail', async () => {
    useAuthStore.setState({ user: { ...customer, addresses: [address] } });
    const chain = { eq: () => chain, select: () => ({ single: async () => ({ data: null, error: Error('denied') }) }) };
    mocks.from.mockImplementation(() => ({ delete: () => chain, select: () => ({ eq: async () => ({ data: null, error: Error('offline') }) }) }));
    await expect(useAuthStore.getState().deleteAddress(address.id)).rejects.toThrow('denied');
    expect(useAuthStore.getState().user?.addresses).toEqual([address]);
  });
});

it('does not let a late profile save overwrite the current account lifetime', async () => {
 let complete!: () => void; mocks.saveProfileEdits.mockReturnValueOnce(new Promise<void>(r => { complete = r; }));
 const updating = useAuthStore.getState().updateProfile({ firstName: 'Stale' });
 authListener('SIGNED_OUT', null); useAuthStore.setState({ user: { ...customer, firstName: 'Reentered' }, session });
 complete(); await updating; expect(useAuthStore.getState().user?.firstName).toBe('Reentered');
});
it('retains a completed profile edit when an older bootstrap read finishes', async () => {
 let complete!: (value: unknown) => void; const pending = new Promise(r => { complete = r; });
 mocks.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'synthetic', user: { id: customer.id, created_at: '2026-01-01' } } }, error: null });
 mocks.completePendingSignup.mockResolvedValue(null);
 mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'profiles' ? { single: () => pending } : Promise.resolve({ data: [], error: null }) }) }));
 const boot = useAuthStore.getState().bootstrap(); await Promise.resolve(); await Promise.resolve();
 await useAuthStore.getState().updateProfile({ firstName: 'Saved' });
 complete({ data: { first_name: 'Old', wallet_balance: 7000 }, error: null }); await boot;
 expect(useAuthStore.getState().user?.firstName).toBe('Saved'); expect(useAuthStore.getState().user?.wallet.balance).toBe(7000);
});
it('an old missing-session response cannot clear a newly signed-in account', async () => {
 let complete!: (value: unknown) => void; mocks.getSession.mockReturnValueOnce(new Promise(r => { complete = r; }));
 const boot = useAuthStore.getState().bootstrap(); authListener('SIGNED_OUT', null);
 useAuthStore.setState({ user: { ...customer, id: 'new' }, session: { ...session, userId: 'new' } });
 complete({ data: { session: null }, error: null }); await boot;
 expect(useAuthStore.getState().user?.id).toBe('new');
});

it('does not falsely clear an active account when SDK signout returns an error', async () => {
 mocks.signOut.mockResolvedValueOnce({ error: { message: 'offline signout' } });
 await expect(useAuthStore.getState().signOut()).rejects.toThrow('offline signout');
 expect(useAuthStore.getState().user?.id).toBe(customer.id); expect(useAuthStore.getState().session).toEqual(session);
});

it('still attempts SDK signout when cart synchronization fails', async () => {
 const log = vi.spyOn(console, 'error').mockImplementation(() => {}); mocks.flushCartToServer.mockRejectedValueOnce(Error('offline cart'));
 try { await useAuthStore.getState().signOut(); expect(mocks.signOut).toHaveBeenCalledTimes(1); expect(useAuthStore.getState().user).toBeNull(); }
 finally { log.mockRestore(); }
});
it('does not sign out a new A lifetime after A to signed-out to A while its cart flush is pending', async () => {
 let finish!: () => void; mocks.flushCartToServer.mockReturnValueOnce(new Promise<void>(r => { finish = r; }));
 const pending = useAuthStore.getState().signOut(); authListener('SIGNED_OUT', null);
 useAuthStore.setState({ user: { ...customer, firstName: 'New lifetime' }, session }); finish(); await pending;
 expect(mocks.signOut).not.toHaveBeenCalled(); expect(useAuthStore.getState().user?.firstName).toBe('New lifetime');
});
