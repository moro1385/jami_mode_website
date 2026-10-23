import { browserStorageKey } from '../../config/supabase-public.js';
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authService } from "@/features/auth/auth";
import { authenticatedUser, signupUser, mapAuthSession as mapSupabaseSession, type AuthSession } from "@/features/auth/domain/auth";
import { accountAddresses } from '@/features/account/addresses';
import { allowedProfileEdits } from '@/features/account/domain/forms';
import { normalizePhone } from "@/lib/phone";
import { useCartStore } from "./cartStore";
import { useCheckoutStore } from "./checkoutStore";
import { flushCartToServer } from "@/lib/cartSync";
import type { Address, Session, User } from "@/types/auth";

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

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => {
      let authEventVersion = 0;
      let signedOutVersion = 0;
      let passwordSignInVersion = 0;
      let accountVersion = 0;
      let profileEditVersion = 0;
      let profileStateVersion = 0;
      let addressStateVersion = 0;
      const captureLocalEdits = () => ({ owner: get().user?.id, profile: profileStateVersion, addresses: addressStateVersion });
      // A read started before a successful local save must not overwrite that save.
      // Wallet and session data still come from the authenticated server response.
      const preserveCompletedEdits = (loaded: User, captured: ReturnType<typeof captureLocalEdits>): User => {
        const current = get().user;
        if (!current || current.id !== loaded.id || captured.owner !== loaded.id) return loaded;
        return { ...loaded,
          ...(captured.profile !== profileStateVersion ? { firstName: current.firstName, lastName: current.lastName, email: current.email } : {}),
          ...(captured.addresses !== addressStateVersion ? { addresses: current.addresses } : {}),
        };
      };
      const refreshAuthenticatedUser = async (currentSession: AuthSession | null, eventVersion: number) => {
        const session = mapSupabaseSession(currentSession);
        if (!session) return;
        if (currentSession?.user) {

          const localEdits = captureLocalEdits();
          const { profile, addresses, names } = await authService.loadAccount(currentSession.user, true);
          const user = authenticatedUser(currentSession.user, profile, addresses, get().user, { names });
          if (eventVersion === authEventVersion) set({ session, user: preserveCompletedEdits(user, localEdits) });
        } else {
           if (eventVersion === authEventVersion) set({ session });
        }
      };
      // Return synchronously: awaiting another Supabase request inside the Auth
      // callback can deadlock its session lock. Ignore stale completed hydration.
      authService.subscribe((event, currentSession) => {
        const eventVersion = ++authEventVersion;
        if (event === 'SIGNED_OUT' || (currentSession?.user && get().user && currentSession.user.id !== get().user?.id)) {
          accountVersion++;
          useCartStore.getState().resetOwner();
          useCheckoutStore.getState().clearCheckout();
          set({ session: null, user: null });
        }
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

      const mutateAddresses = async (operation: (user: User) => Promise<Address[]>) => {
        const { user, session } = get();
        if (!user || !session || session.userId !== user.id) throw Error("Sign in before editing addresses");
        const signOutVersion = signedOutVersion;
        const identityVersion = accountVersion;
        const apply = (addresses: Address[]) => {
          if (get().user?.id === user.id && signedOutVersion === signOutVersion && accountVersion === identityVersion) { addressStateVersion++; set({ user: { ...get().user!, addresses } }); }
        };
        try { apply(await operation(user)); }
        catch (error) {
          // A multi-step default change can partly persist: reload truth, never invent rollback success.
          try { apply(await accountAddresses.list(user.id)); } catch { /* Retain last known state on read failure. */ }
          throw error;
        }
      };

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
            const localEdits = captureLocalEdits();
            const currentSession = await authService.getSession();
            if (eventVersion !== authEventVersion) return;
            if (!currentSession) {
              set({ session: null, user: null });
              return;
            }

            const { profile, addresses } = await authService.loadAccount(currentSession.user, true);
            if (eventVersion !== authEventVersion) return;
            set({ session: mapSupabaseSession(currentSession), user: preserveCompletedEdits(authenticatedUser(currentSession.user, profile, addresses, get().user), localEdits) });
          } catch {
            if (eventVersion === authEventVersion) set({ session: null, user: null });
          } finally {
            set({ isBootstrapping: false });
          }
        },

        signInWithPassword: async (phone, password) => {
          const loginVersion = ++passwordSignInVersion;
          const signOutVersion = signedOutVersion;
          const normalized = normalizePhone(phone);
          const data = await authService.signIn(normalized, password);
          if (data.session && data.user) {
            const localEdits = captureLocalEdits();
            const { profile, addresses } = await authService.loadAccount(data.user, false);
            if (signOutVersion !== signedOutVersion || loginVersion !== passwordSignInVersion) return;
            set({ session: mapSupabaseSession(data.session), user: preserveCompletedEdits(authenticatedUser(data.user, profile, addresses, get().user, { phone: normalized }), localEdits) });
          }
        },

        signUp: async (input) => {
          const signOutVersion = signedOutVersion;
          const normalized = normalizePhone(input.phone);

          const data = await authService.signUp(input);
          if (data.user && data.session && signOutVersion === signedOutVersion) {
            set({ session: mapSupabaseSession(data.session), user: signupUser(data.user, { ...input, phone: normalized }, get().user) });
          }
        },

        requestOtp: (phone) => authService.requestOtp(phone),
        // The synchronous Auth event listener remains the sole OTP state hydrator.
        verifyOtp: (phone, code) => authService.verifyOtp(phone, code),

        signOut: async () => {
          const identityVersion = accountVersion;
          const userId = get().user?.id;
          if (userId) {
            try { await flushCartToServer(userId); }
            catch (error) { console.error('Cart is still pending synchronization:', error); }
            // Cart persistence failure must not prevent an attempt to terminate the Auth session.
            if (get().user?.id !== userId || accountVersion !== identityVersion) return;
          }
          await authService.signOut();
          if (get().user && (get().user?.id !== userId || accountVersion !== identityVersion)) return;
          useCartStore.getState().resetOwner();
          set({ session: null, user: null });
        },

        updateProfile: async (patch) => {
          const { session, user } = get();
          if (!session || !user) throw new Error("Sign in before editing your profile");

          const identityVersion = accountVersion, editVersion = ++profileEditVersion;
          patch = allowedProfileEdits(patch);
          await authService.saveProfileEdits(user.id, patch);
          // Do not merge unchecked runtime properties (such as wallet) into state.
          if (get().user?.id === user.id && accountVersion === identityVersion && profileEditVersion === editVersion) {
            const saved = { ...get().user! };
            if (patch.firstName !== undefined) saved.firstName = patch.firstName;
            if (patch.lastName !== undefined) saved.lastName = patch.lastName;
            if (patch.email !== undefined) saved.email = patch.email;
            profileStateVersion++;
            set({ user: saved });
          }
        },

        upsertAddress: (address) => mutateAddresses(user => accountAddresses.save(user.id, user.addresses, address)),
        deleteAddress: (id) => mutateAddresses(user => accountAddresses.remove(user.id, user.addresses, id)),
        setDefaultAddress: (id) => mutateAddresses(user => accountAddresses.setDefault(user.id, user.addresses, id)),

      };
    },
    {
      name: browserStorageKey("jamimode-auth", import.meta.env.MODE),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session, user: state.user }),
    }
  )
);
