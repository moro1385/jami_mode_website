import type { User, Session } from '@/types/auth';
import type { Address } from '@/features/account/domain/address';
export type AuthIdentity = { id: string; phone?: string; email?: string; created_at: string };
export type AuthSession = { access_token: string; expires_in?: number; user: AuthIdentity };
export type SignupInput = { phone: string; firstName: string; lastName: string; password: string };
export type ProfileNames = { firstName: string; lastName: string };
export type AuthProfile = { phone: string | null; first_name: string | null; last_name: string | null; email: string | null; wallet_balance: number | null };
export function mapAuthSession(session: AuthSession | null, now = Date.now()): Session | null {
  if (!session) return null;
  return { token: session.access_token, userId: session.user.id, expiresAt: now + (session.expires_in ? session.expires_in * 1000 : 3600000) };
}
export function authenticatedUser(identity: AuthIdentity, profile: AuthProfile | null, addresses: Address[], previous: User | null, fallback?: { phone?: string; names?: ProfileNames | null }): User {
  return {
    id: identity.id, phone: identity.phone || profile?.phone || fallback?.phone || '',
    firstName: profile?.first_name || fallback?.names?.firstName || '',
    lastName: profile?.last_name || fallback?.names?.lastName || '',
    email: profile?.email || identity.email, createdAt: identity.created_at, addresses,
    wallet: { balance: profile?.wallet_balance || 0, currencyCode: 'IRR', transactions: [] },
    orders: previous?.id === identity.id ? previous.orders : [],
  };
}
export function signupUser(identity: AuthIdentity, input: SignupInput, previous: User | null): User {
  const same = previous?.id === identity.id ? previous : null;
  return { id: identity.id, phone: input.phone, firstName: input.firstName, lastName: input.lastName,
    email: identity.email, createdAt: identity.created_at, addresses: same?.addresses || [],
    wallet: same?.wallet || { balance: 0, currencyCode: 'IRR', transactions: [] }, orders: same?.orders || [] };
}
