import type { Address } from '@/features/account/domain/address';
import type { ProfileEdits } from '@/features/account/domain/forms';
import type { AuthIdentity, AuthSession, AuthProfile, ProfileNames, SignupInput } from '../domain/auth';
export type AuthResult = { user: AuthIdentity | null; session: AuthSession | null };
export interface AuthRepository {
  getSession(): Promise<AuthSession | null>;
  subscribe(listener: (event: string, session: AuthSession | null) => void): void;
  signIn(phone: string, password: string): Promise<AuthResult>;
  signUp(input: SignupInput): Promise<AuthResult>;
  phoneExists(phone: string): Promise<boolean>;
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  profile(userId: string): Promise<AuthProfile | null>;
  addresses(userId: string): Promise<Address[]>;
  isAdmin(userId: string): Promise<boolean>;
}
export interface ProfileCompletion {
  complete(user: AuthIdentity): Promise<ProfileNames | null>;
  saveEdits(userId: string, patch: ProfileEdits): Promise<void>;
}
export interface PendingSignupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
