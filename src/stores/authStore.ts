import { browserStorageKey } from '../../config/supabase-public.js';
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phone";
import { completePendingSignup, saveProfileEdits } from "@/lib/profileWrites";
import { useCartStore } from "./cartStore";
import { flushCartToServer } from "@/lib/cartSync";
import type { Address, Session, User } from "@/types/auth";
import type { Session as SupabaseSession } from "@supabase/supabase-js";

interface AuthStore {
  session: Session | null;
  user: User | null;
  isBootstrapping: boolean;
  isAuthenticated: () => boolean;
  bootstrap: () => Promise<void>;
  signInWithPassword: (phone: string, password: string) => Promise<void>;
  signUp: (input: { phone: string; firstName: string; lastName: string; password: string }) => Promise<void>;
  requestOtp: (phone: string) => Promise<{ expiresInSeconds: number; devCode?: string }>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, "firstName" | "lastName" | "email">>) => Promise<void>;
  upsertAddress: (address: Omit<Address, "id"> & { id?: string }) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  setDefaultAddress: (id: string) => Promise<void>;
}

const mapSupabaseSession = (s: SupabaseSession | null): Session | null => {
  if (!s) return null;
  return {
    token: s.access_token,
    userId: s.user.id,
    expiresAt: (s.expires_in ? Date.now() + s.expires_in * 1000 : Date.now() + 3600 * 1000),
  };
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => {
      let authEventVersion = 0;
      let signedOutVersion = 0;
      const refreshAuthenticatedUser = async (currentSession: SupabaseSession | null, eventVersion: number) => {
        const session = mapSupabaseSession(currentSession);
        if (!session) return;
        if (currentSession?.user) {

          // Check for pending signup profile data before reading
          let newProfileData: { firstName: string; lastName: string } | null = null;
          try {
            newProfileData = await completePendingSignup(currentSession.user);
          } catch (e) {
            // Keep pending data for a retry; authentication remains available.
            console.error("Failed to save signup profile", e);
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", currentSession.user.id)
            .single();

          const { data: dbAddresses } = await supabase
            .from("addresses")
            .select("*")
            .eq("user_id", currentSession.user.id);

          const mappedAddresses: Address[] = (dbAddresses || []).map((dbA) => ({
            id: dbA.id,
            label: dbA.label || "",
            recipient: dbA.recipient || "",
            phone: dbA.phone || "",
            country: dbA.country || "",
            city: dbA.city || "",
            line1: dbA.line1 || "",
            line2: dbA.line2 || "",
            postalCode: dbA.postal_code || "",
            isDefault: dbA.is_default || false,
          }));

          const currentUser = get().user;
          const user: User = {
            id: currentSession.user.id,
            phone: currentSession.user.phone || profile?.phone || "",
            firstName: profile?.first_name || (newProfileData?.firstName ?? ""),
            lastName: profile?.last_name || (newProfileData?.lastName ?? ""),
            email: profile?.email || currentSession.user.email,
            createdAt: currentSession.user.created_at,
            addresses: mappedAddresses,
            wallet: { balance: profile?.wallet_balance || 0, currencyCode: "IRR", transactions: [] },
            orders: currentUser?.orders || [],
          };
          if (eventVersion === authEventVersion) set({ session, user });
        } else {
           if (eventVersion === authEventVersion) set({ session });
        }
      };
      // Return synchronously: awaiting another Supabase request inside the Auth
      // callback can deadlock its session lock. Ignore stale completed hydration.
      supabase.auth.onAuthStateChange((event, currentSession) => {
        const eventVersion = ++authEventVersion;
        if (event === 'SIGNED_OUT') {
          signedOutVersion++;
          set({ session: null, user: null });
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setTimeout(() => {
            if (eventVersion !== authEventVersion) return;
            void refreshAuthenticatedUser(currentSession, eventVersion).catch((error) => {
              console.error("Failed to refresh authenticated profile", error);
            });
          }, 0);
        }
      });

      return {
        session: null,
        user: null,
        isBootstrapping: false,

        isAuthenticated: () => {
          const { session } = get();
          return !!session && session.expiresAt > Date.now();
        },

        bootstrap: async () => {
          const eventVersion = authEventVersion;
          set({ isBootstrapping: true });
          try {
            const { data: { session: currentSession }, error } = await supabase.auth.getSession();
            if (error || !currentSession) {
              set({ session: null, user: null });
              return;
            }

            try {
              await completePendingSignup(currentSession.user);
            } catch (e) {
              console.error("Failed to save signup profile", e);
            }

            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", currentSession.user.id)
              .single();

            const { data: dbAddresses } = await supabase
              .from("addresses")
              .select("*")
              .eq("user_id", currentSession.user.id);

            const mappedAddresses: Address[] = (dbAddresses || []).map((dbA) => ({
              id: dbA.id,
              label: dbA.label || "",
              recipient: dbA.recipient || "",
              phone: dbA.phone || "",
              country: dbA.country || "",
              city: dbA.city || "",
              line1: dbA.line1 || "",
              line2: dbA.line2 || "",
              postalCode: dbA.postal_code || "",
              isDefault: dbA.is_default || false,
            }));

            if (eventVersion !== authEventVersion) return;
            const currentUser = get().user;
            set({
              session: mapSupabaseSession(currentSession),
              user: {
                id: currentSession.user.id,
                phone: currentSession.user.phone || profile?.phone || "",
                firstName: profile?.first_name || "",
                lastName: profile?.last_name || "",
                email: profile?.email || currentSession.user.email,
                createdAt: currentSession.user.created_at,
                addresses: mappedAddresses,
                wallet: { balance: profile?.wallet_balance || 0, currencyCode: "IRR", transactions: [] },
                orders: currentUser?.orders || [],
              }
            });
          } catch {
            if (eventVersion === authEventVersion) set({ session: null, user: null });
          } finally {
            set({ isBootstrapping: false });
          }
        },

        signInWithPassword: async (phone, password) => {
          const signOutVersion = signedOutVersion;
          const normalized = normalizePhone(phone);
          const { data, error } = await supabase.auth.signInWithPassword({ phone: normalized, password });
          if (error) throw new Error(error.message);

          if (data.session && data.user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", data.user.id)
              .single();

            const { data: dbAddresses } = await supabase
              .from("addresses")
              .select("*")
              .eq("user_id", data.user.id);

            const mappedAddresses: Address[] = (dbAddresses || []).map((dbA) => ({
              id: dbA.id,
              label: dbA.label || "",
              recipient: dbA.recipient || "",
              phone: dbA.phone || "",
              country: dbA.country || "",
              city: dbA.city || "",
              line1: dbA.line1 || "",
              line2: dbA.line2 || "",
              postalCode: dbA.postal_code || "",
              isDefault: dbA.is_default || false,
            }));

            if (signOutVersion !== signedOutVersion) return;
            const currentUser = get().user;
            set({
              session: mapSupabaseSession(data.session),
              user: {
                id: data.user.id,
                phone: data.user.phone || profile?.phone || normalized,
                firstName: profile?.first_name || "",
                lastName: profile?.last_name || "",
                email: profile?.email || data.user.email,
                createdAt: data.user.created_at,
                addresses: mappedAddresses,
                wallet: { balance: profile?.wallet_balance || 0, currencyCode: "IRR", transactions: [] },
                orders: currentUser?.orders || [],
              }
            });
          }
        },

        signUp: async (input) => {
          const signOutVersion = signedOutVersion;
          const normalized = normalizePhone(input.phone);

          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("phone", normalized)
            .maybeSingle();

          if (existingProfile) {
            throw new Error("An account with this phone number already exists");
          }

          // Store before signUp: SIGNED_IN can fire before its promise resolves.
          const pendingSignup = JSON.stringify({ phone: normalized, firstName: input.firstName, lastName: input.lastName });
          sessionStorage.setItem("jamimode-pending-signup", pendingSignup);
          const { data, error } = await supabase.auth.signUp({
            phone: normalized,
            password: input.password
          }).catch((error) => {
            if (sessionStorage.getItem("jamimode-pending-signup") === pendingSignup) sessionStorage.removeItem("jamimode-pending-signup");
            throw error;
          });
          if (error) {
            if (sessionStorage.getItem("jamimode-pending-signup") === pendingSignup) sessionStorage.removeItem("jamimode-pending-signup");
            throw new Error(error.message);
          }

          if (data.user) {
            if (data.session) {
              if (signOutVersion !== signedOutVersion) return;
              const currentUser = get().user?.id === data.user.id ? get().user : null;
              set({
                session: mapSupabaseSession(data.session),
                user: {
                  id: data.user.id,
                  phone: normalized,
                  firstName: input.firstName,
                  lastName: input.lastName,
                  email: data.user.email, // At signup, we rely on auth user email if any
                  createdAt: data.user.created_at,
                  addresses: currentUser?.addresses || [],
                  wallet: currentUser?.wallet || { balance: 0, currencyCode: "IRR", transactions: [] },
                  orders: currentUser?.orders || [],
                }
              });
            }
          }
        },

        requestOtp: async (phone) => {
           const normalized = normalizePhone(phone);
           const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
           if (error) throw new Error(error.message);
           return { expiresInSeconds: 120 };
        },

        verifyOtp: async (phone, code) => {
          const normalized = normalizePhone(phone);
          const { error } = await supabase.auth.verifyOtp({ phone: normalized, token: code, type: 'sms' });
          if (error) throw new Error(error.message);

          // State will be set by the onAuthStateChange listener which centralizes profile fetching and insertion
        },

        signOut: async () => {
          const userId = get().user?.id;
          if (userId) {
            await flushCartToServer(userId);
          }
          await supabase.auth.signOut();
          useCartStore.getState().clearCart();
          set({ session: null, user: null });
        },

        updateProfile: async (patch) => {
          const { session, user } = get();
          if (!session || !user) throw new Error("Sign in before editing your profile");

          await saveProfileEdits(user.id, patch);
          // Do not merge unchecked runtime properties (such as wallet) into state.
          if (get().user?.id === user.id) {
            const saved = { ...get().user! };
            if (patch.firstName !== undefined) saved.firstName = patch.firstName;
            if (patch.lastName !== undefined) saved.lastName = patch.lastName;
            if (patch.email !== undefined) saved.email = patch.email;
            set({ user: saved });
          }
        },

        upsertAddress: async (address) => {
          const { user, session } = get();
          if (!user || !session) return;

          const isNew = !address.id;
          const id = address.id ?? crypto.randomUUID();

          const dbAddress = {
            id,
            user_id: user.id,
            label: address.label,
            recipient: address.recipient,
            phone: address.phone,
            country: address.country,
            city: address.city,
            line1: address.line1,
            line2: address.line2 || null,
            postal_code: address.postalCode,
            is_default: address.isDefault,
          };

          if (isNew) {
            await supabase.from("addresses").insert(dbAddress);
          } else {
            await supabase.from("addresses").update(dbAddress).eq("id", id);
          }

          const exists = user.addresses.some((a) => a.id === id);
          let addresses = exists
            ? user.addresses.map((a) => (a.id === id ? { ...a, ...address, id } : a))
            : [...user.addresses, { ...address, id }];

          const shouldBeDefault = address.isDefault || addresses.length === 1;
          addresses = addresses.map((a) => ({ ...a, isDefault: shouldBeDefault ? a.id === id : a.isDefault }));

          if (shouldBeDefault) {
              await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id).neq("id", id);
              await supabase.from("addresses").update({ is_default: true }).eq("id", id);
          }

          set({ user: { ...user, addresses } });
        },

        deleteAddress: async (id) => {
          const { user } = get();
          if (!user) return;

          await supabase.from("addresses").delete().eq("id", id);

          let addresses = user.addresses.filter((a) => a.id !== id);
          if (addresses.length && !addresses.some((a) => a.isDefault)) {
            addresses = addresses.map((a, i) => ({ ...a, isDefault: i === 0 }));
            if (addresses[0]) {
               await supabase.from("addresses").update({ is_default: true }).eq("id", addresses[0].id);
            }
          }
          set({ user: { ...user, addresses } });
        },

        setDefaultAddress: async (id) => {
          const { user } = get();
          if (!user) return;

          await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
          await supabase.from("addresses").update({ is_default: true }).eq("id", id);

          const addresses = user.addresses.map((a) => ({ ...a, isDefault: a.id === id }));
          set({ user: { ...user, addresses } });
        },
      };
    },
    {
      name: browserStorageKey("jamimode-auth", import.meta.env.MODE),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session, user: state.user }),
    }
  )
);
