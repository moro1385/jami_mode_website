import { describe, it, expect, vi } from 'vitest';
import { createAuthService, PENDING_SIGNUP_KEY } from './application/authService';
import type { AuthRepository, AuthResult } from './application/authRepository';
import { authenticatedUser, mapAuthSession, signupUser, type AuthIdentity } from './domain/auth';
import type { User } from '@/types/auth';
const identity: AuthIdentity = { id: 'owner', phone: '+989110000001', email: 'auth@example.test', created_at: '2026-01-01' };
const input = { phone: '09110000001', firstName: 'First', lastName: 'Last', password: 'synthetic-password' };
const result: AuthResult = { user: identity, session: { access_token: 'synthetic', expires_in: 120, user: identity } };
function setup() {
  const repository = {
    getSession: vi.fn(), subscribe: vi.fn(), signIn: vi.fn().mockResolvedValue(result), signUp: vi.fn().mockResolvedValue(result),
    phoneExists: vi.fn().mockResolvedValue(false), requestOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(),
    profile: vi.fn().mockResolvedValue(null), addresses: vi.fn().mockResolvedValue([]), isAdmin: vi.fn().mockResolvedValue(false),
  } satisfies AuthRepository;
  const completion = { complete: vi.fn().mockResolvedValue(null), saveEdits: vi.fn() };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const pendingError = vi.fn();
  return { repository, completion, storage, pendingError, service: createAuthService(repository, completion, storage, pendingError) };
}
describe('Auth use cases preserve signup and OTP contracts', () => {
  it('stores only phone-bound names before invoking signup', async () => {
    const { repository, service, storage } = setup();
    repository.signUp.mockImplementation(async () => {
      expect(JSON.parse(storage.getItem(PENDING_SIGNUP_KEY)!)).toEqual({ phone: '+989110000001', firstName: 'First', lastName: 'Last' });
      expect(storage.getItem(PENDING_SIGNUP_KEY)).not.toContain(input.password);
      return result;
    });
    expect(await service.signUp(input)).toEqual(result);
    expect(repository.signUp).toHaveBeenCalledWith({ ...input, phone: '+989110000001' });
  });
  it('cleans its pending data on failure', async () => {
    const { repository, service, storage } = setup(); repository.signUp.mockRejectedValue(Error('denied'));
    await expect(service.signUp(input)).rejects.toThrow('denied');
    expect(storage.getItem(PENDING_SIGNUP_KEY)).toBeNull();
  });
  it('does not remove a newer signup draft when an older request fails', async () => {
    const { repository, service, storage } = setup();
    repository.signUp.mockImplementation(async () => { storage.setItem(PENDING_SIGNUP_KEY, 'newer'); throw Error('offline'); });
    await expect(service.signUp(input)).rejects.toThrow('offline');
    expect(storage.getItem(PENDING_SIGNUP_KEY)).toBe('newer');
  });
  it('rejects an existing phone without replacing pending names or invoking signup', async () => {
    const { repository, service, storage } = setup(); repository.phoneExists.mockResolvedValue(true); storage.setItem(PENDING_SIGNUP_KEY, 'previous');
    await expect(service.signUp(input)).rejects.toThrow('already exists');
    expect(repository.signUp).not.toHaveBeenCalled(); expect(storage.getItem(PENDING_SIGNUP_KEY)).toBe('previous');
  });
  it('normalizes password and OTP phones and retains the local countdown contract', async () => {
    const { service, repository } = setup();
    await service.signIn('۰۹۱۱۰۰۰۰۰۰۱', 'synthetic');
    expect(repository.signIn).toHaveBeenCalledWith('+989110000001', 'synthetic');
    expect(await service.requestOtp('09110000001')).toEqual({ expiresInSeconds: 120 });
    await service.verifyOtp('09110000001', '123456');
    expect(repository.requestOtp).toHaveBeenCalledWith('+989110000001');
    expect(repository.verifyOtp).toHaveBeenCalledWith('+989110000001', '123456');
  });
  it('retains pending names for retry when completion fails, then loads profile and addresses in order', async () => {
    const { service, repository, completion, pendingError } = setup(); completion.complete.mockRejectedValue(Error('denied'));
    const account = await service.loadAccount(identity, true);
    expect(account).toEqual({ names: null, profile: null, addresses: [] });
    expect(pendingError).toHaveBeenCalled();
    expect(completion.complete.mock.invocationCallOrder[0]).toBeLessThan(repository.profile.mock.invocationCallOrder[0]);
    expect(repository.profile.mock.invocationCallOrder[0]).toBeLessThan(repository.addresses.mock.invocationCallOrder[0]);
  });
  it('does not complete pending signup during password login hydration', async () => {
    const { service, completion } = setup(); await service.loadAccount(identity, false);
    expect(completion.complete).not.toHaveBeenCalled();
  });
  it('does not hide a thrown hydration transport error', async () => {
    const { service, repository } = setup(); repository.profile.mockRejectedValue(Error('offline'));
    await expect(service.loadAccount(identity, false)).rejects.toThrow('offline');
    expect(repository.addresses).not.toHaveBeenCalled();
  });
  it('passes only name and email edits to the existing writer', async () => {
    const { service, completion } = setup();
    await service.saveProfileEdits('owner', { firstName: 'Changed', wallet: { balance: 99 } } as { firstName: string });
    expect(completion.saveEdits).toHaveBeenCalledWith('owner', { firstName: 'Changed' });
  });
  it('does not check a role for an empty identity', async () => {
    const { service, repository } = setup(); expect(await service.isAdmin('')).toBe(false);
    expect(repository.isAdmin).not.toHaveBeenCalled();
  });
});
describe('pure Auth mapping and account isolation', () => {
  const cached: User = { id: identity.id, phone: identity.phone!, firstName: 'Cached', lastName: 'Name', createdAt: identity.created_at, addresses: [], wallet: { balance: 500, currencyCode: 'IRR', transactions: [] }, orders: [{ id: 'cached' }] as User['orders'] };
  it('retains session expiration mapping and null fallback', () => {
    expect(mapAuthSession(null, 1000)).toBeNull();
    expect(mapAuthSession(result.session, 1000)).toEqual({ userId: 'owner', token: 'synthetic', expiresAt: 121000 });
    expect(mapAuthSession({ ...result.session!, expires_in: undefined }, 1000)?.expiresAt).toBe(3601000);
  });
  it('preserves auth phone, profile name/email and server balance precedence', () => {
    const mapped = authenticatedUser(identity, { phone: 'profile-phone', first_name: 'Saved', last_name: 'Name', email: 'profile@example.test', wallet_balance: 10 }, [], cached, { names: { firstName: 'Pending', lastName: 'Names' } });
    expect(mapped).toMatchObject({ phone: identity.phone, firstName: 'Saved', email: 'profile@example.test', wallet: { balance: 10 }, orders: cached.orders });
  });
  it('uses pending-name fallback only when requested by its hydration path', () => {
    expect(authenticatedUser(identity, null, [], cached).firstName).toBe('');
    expect(authenticatedUser(identity, null, [], cached, { names: { firstName: 'Pending', lastName: 'Name' } }).firstName).toBe('Pending');
  });
  it('never carries another owner’s cached orders, addresses or balance', () => {
    const other = { ...identity, id: 'other' };
    expect(authenticatedUser(other, null, [], cached)).toMatchObject({ orders: [], addresses: [], wallet: { balance: 0 } });
    expect(signupUser(other, input, cached)).toMatchObject({ orders: [], addresses: [], wallet: { balance: 0 } });
  });
  it('retains same-owner cached values for an immediate signup session', () => {
    expect(signupUser(identity, { ...input, phone: identity.phone! }, cached)).toMatchObject({ orders: cached.orders, wallet: cached.wallet, firstName: input.firstName });
  });
});
