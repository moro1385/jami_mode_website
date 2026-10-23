import { normalizePhone } from '@/lib/phone';
import { allowedProfileEdits, type ProfileEdits } from '@/features/account/domain/forms';
import type { AuthIdentity, ProfileNames, SignupInput } from '../domain/auth';
import type { AuthRepository, ProfileCompletion, PendingSignupStorage } from './authRepository';
export const PENDING_SIGNUP_KEY = 'jamimode-pending-signup';
export function createAuthService(repository: AuthRepository, profiles: ProfileCompletion, pending: PendingSignupStorage, pendingError: (error: unknown) => void) {
  return {
    getSession: () => repository.getSession(),
    subscribe: (listener: Parameters<AuthRepository['subscribe']>[0]) => repository.subscribe(listener),
    signIn: (phone: string, password: string) => repository.signIn(normalizePhone(phone), password),
    async loadAccount(identity: AuthIdentity, completeSignup: boolean) {
      let names: ProfileNames | null = null;
      if (completeSignup) try { names = await profiles.complete(identity); }
      catch (error) { pendingError(error); }
      // Retain sequential reads and the existing adapter's resolved-error fallback.
      const profile = await repository.profile(identity.id);
      const addresses = await repository.addresses(identity.id);
      return { profile, addresses, names };
    },
    async signUp(input: SignupInput) {
      const normalized = { ...input, phone: normalizePhone(input.phone) };
      if (await repository.phoneExists(normalized.phone)) throw Error('An account with this phone number already exists');
      // SIGNED_IN may fire synchronously before signUp resolves. Store only phone-bound names, never the password.
      const raw = JSON.stringify({ phone: normalized.phone, firstName: input.firstName, lastName: input.lastName });
      pending.setItem(PENDING_SIGNUP_KEY, raw);
      try { return await repository.signUp(normalized); }
      catch (error) {
        if (pending.getItem(PENDING_SIGNUP_KEY) === raw) pending.removeItem(PENDING_SIGNUP_KEY);
        throw error;
      }
    },
    async requestOtp(phone: string) { await repository.requestOtp(normalizePhone(phone)); return { expiresInSeconds: 120 }; },
    verifyOtp: (phone: string, code: string) => repository.verifyOtp(normalizePhone(phone), code),
    signOut: () => repository.signOut(),
    saveProfileEdits: (userId: string, patch: ProfileEdits) => profiles.saveEdits(userId, allowedProfileEdits(patch)),
    isAdmin: (userId: string) => userId ? repository.isAdmin(userId) : Promise.resolve(false),
  };
}
