import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => {
  const chain = {
    update: vi.fn(), insert: vi.fn(), eq: vi.fn(), select: vi.fn(),
    maybeSingle: vi.fn(), single: vi.fn(),
  };
  return { from: vi.fn(), ...chain };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: db }));
import { completePendingSignup, saveProfileEdits, saveSignupProfile } from "./profileWrites";

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  for (const method of [db.from, db.update, db.insert, db.eq, db.select]) method.mockReturnValue(db);
  db.maybeSingle.mockResolvedValue({ data: { id: "customer" }, error: null });
  db.single.mockResolvedValue({ data: { id: "customer" }, error: null });
});

describe("narrow profile writes", () => {
  it("updates trigger-created profile without upsert or identity/financial updates", async () => {
    await saveSignupProfile("customer", { firstName: "First", lastName: "Last" }, "+989110000001");
    expect(db.update).toHaveBeenCalledWith({ first_name: "First", last_name: "Last", phone: "+989110000001" });
    expect(db.eq).toHaveBeenCalledWith("id", "customer");
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("inserts only the safe fields when the profile is missing", async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await saveSignupProfile("customer", { firstName: "First", lastName: "Last" }, "+989110000001");
    expect(db.insert).toHaveBeenCalledWith({ id: "customer", first_name: "First", last_name: "Last", phone: "+989110000001" });
  });
  it("retries a narrow update after a duplicate insert race", async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.single.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    await saveSignupProfile("customer", { firstName: "First", lastName: "Last" }, "+989110000001");
    expect(db.update).toHaveBeenCalledTimes(2);
  });
  it("does not silently succeed if the duplicate race retry cannot see a profile", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null });
    db.single.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    await expect(saveSignupProfile("customer", { firstName: "First", lastName: "Last" }, "+989110000001")).rejects.toThrow("Profile was not saved");
  });
  it("propagates a non-duplicate insert error", async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const error = { code: "42501", message: "denied" };
    db.single.mockResolvedValueOnce({ data: null, error });
    await expect(saveSignupProfile("customer", { firstName: "First", lastName: "Last" }, "phone")).rejects.toEqual(error);
  });
  it("drops injected financial fields from profile editing payloads", async () => {
    await saveProfileEdits("customer", { firstName: "Safe", wallet_balance: 9000, id: "other" } as Parameters<typeof saveProfileEdits>[1]);
    expect(db.update).toHaveBeenCalledWith({ first_name: "Safe" });
  });
  it("rejects a denied edit", async () => {
    const error = { code: "42501" };
    db.maybeSingle.mockResolvedValueOnce({ data: null, error });
    await expect(saveProfileEdits("customer", { email: "safe@example.invalid" })).rejects.toEqual(error);
  });
  it("rejects a zero-row profile edit", async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(saveProfileEdits("customer", { firstName: "Safe" })).rejects.toThrow("Profile was not saved");
  });
  it("stores an optional blank email as NULL instead of a colliding empty value", async () => {
    await saveProfileEdits("customer", { email: "   " });
    expect(db.update).toHaveBeenCalledWith({ email: null });
  });
});

describe("pending signup compatibility", () => {
  const pending = { phone: "09110000001", firstName: "First", lastName: "Last" };
  beforeEach(() => sessionStorage.setItem("jamimode-pending-signup", JSON.stringify(pending)));
  it("saves matching OTP signup names and clears them only after success", async () => {
    await completePendingSignup({ id: "customer", phone: "+989110000001" });
    expect(db.update).toHaveBeenCalled();
    expect(sessionStorage.getItem("jamimode-pending-signup")).toBeNull();
  });
  it("retains pending names on a database failure for retry", async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(completePendingSignup({ id: "customer", phone: "+989110000001" })).rejects.toEqual({ code: "42501" });
    expect(sessionStorage.getItem("jamimode-pending-signup")).not.toBeNull();
  });
  it("does not apply another phone's pending signup to the signed-in account", async () => {
    await completePendingSignup({ id: "other", phone: "+989110000002" });
    expect(db.update).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("jamimode-pending-signup")).not.toBeNull();
  });
  it("does not apply unbound legacy pending data", async () => {
    sessionStorage.setItem("jamimode-pending-signup", JSON.stringify({ firstName: "Old", lastName: "Data" }));
    await completePendingSignup({ id: "customer", phone: "+989110000001" });
    expect(db.update).not.toHaveBeenCalled();
  });
  it.each(["null", "{broken", "[]", "42"])("ignores malformed pending signup data (%s) without blocking auth", async (raw) => {
    sessionStorage.setItem("jamimode-pending-signup", raw);
    await expect(completePendingSignup({ id: "customer", phone: "+989110000001" })).resolves.toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });
});
