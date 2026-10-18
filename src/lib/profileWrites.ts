import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phone";

export async function completePendingSignup(user: { id: string; phone?: string }) {
  const raw = sessionStorage.getItem("jamimode-pending-signup");
  if (!raw) return null;
  let pending: unknown;
  try { pending = JSON.parse(raw); } catch { return null; }
  if (!pending || typeof pending !== "object" || !("phone" in pending)
      || !("firstName" in pending) || !("lastName" in pending)) return null;
  if (typeof pending.phone !== "string" || !user.phone || normalizePhone(pending.phone) !== normalizePhone(user.phone)
      || typeof pending.firstName !== "string" || typeof pending.lastName !== "string") return null;
  await saveSignupProfile(user.id, { firstName: pending.firstName, lastName: pending.lastName }, user.phone);
  // A newer signup may have replaced the pending data while this request ran.
  if (sessionStorage.getItem("jamimode-pending-signup") === raw) sessionStorage.removeItem("jamimode-pending-signup");
  return { firstName: pending.firstName as string, lastName: pending.lastName as string };
}

// Explicit payloads: never spread a session, User, or profile into a DB write.
export async function saveSignupProfile(userId: string, names: { firstName: string; lastName: string }, phone: string) {
  const fields = { first_name: names.firstName, last_name: names.lastName, phone };
  const update = () => supabase.from("profiles").update(fields).eq("id", userId).select("id").maybeSingle();
  const result = await update();
  if (result.error) throw result.error;
  if (result.data) return;

  const inserted = await supabase.from("profiles").insert({ id: userId, ...fields }).select("id").single();
  if (!inserted.error) return;
  if (inserted.error.code !== "23505") throw inserted.error;
  // The auth trigger or another tab may have created this profile meanwhile.
  const retry = await update();
  if (retry.error) throw retry.error;
  if (!retry.data) throw new Error("Profile was not saved");
}

export async function saveProfileEdits(userId: string, patch: { firstName?: string; lastName?: string; email?: string }) {
  const fields: { first_name?: string; last_name?: string; email?: string | null } = {};
  if (patch.firstName !== undefined) fields.first_name = patch.firstName;
  if (patch.lastName !== undefined) fields.last_name = patch.lastName;
  if (patch.email !== undefined) fields.email = patch.email.trim() || null;
  if (!Object.keys(fields).length) return;
  const { data, error } = await supabase.from("profiles").update(fields).eq("id", userId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Profile was not saved");
}
