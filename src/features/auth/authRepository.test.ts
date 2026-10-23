import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAuthRepository } from './infrastructure/supabaseAuthRepository';
function setup() {
  const auth = { getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn() };
  const chain = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), then: vi.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  const from = vi.fn().mockReturnValue(chain), rpc = vi.fn();
  return { auth, chain, rpc, repository: createSupabaseAuthRepository({ auth, from, rpc } as unknown as Parameters<typeof createSupabaseAuthRepository>[0]) };
}
describe('Supabase Auth adapter compatibility', () => {
  it('returns a synchronous callback to the SDK, leaving hydration scheduling in the store', () => {
    const { auth, repository } = setup(); const listener = vi.fn();
    repository.subscribe(listener);
    const callback = auth.onAuthStateChange.mock.calls[0][0];
    expect(callback('SIGNED_OUT', null)).toBeUndefined();
    expect(listener).toHaveBeenCalledWith('SIGNED_OUT', null);
  });
  it('sends names as signup metadata and retains the password-login contract', async () => {
    const { repository, auth } = setup(); const data = { user: null, session: null };
    auth.signUp.mockResolvedValue({ data, error: null }); auth.signInWithPassword.mockResolvedValue({ data, error: null });
    await repository.signUp({ phone: '+989110000001', password: 'synthetic', firstName: 'First', lastName: 'Last' });
    expect(auth.signUp).toHaveBeenCalledWith({ phone: '+989110000001', password: 'synthetic', options: { data: { first_name: 'First', last_name: 'Last' } } });
    await repository.signIn('+989110000001', 'synthetic');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ phone: '+989110000001', password: 'synthetic' });
  });
  it('retains SMS token verification and propagates rejected OTP requests', async () => {
    const { repository, auth } = setup(); auth.verifyOtp.mockResolvedValue({ error: null }); auth.signInWithOtp.mockResolvedValue({ error: { message: 'limited' } });
    await repository.verifyOtp('+989110000001', '123456');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: '+989110000001', token: '123456', type: 'sms' });
    await expect(repository.requestOtp('+989110000001')).rejects.toThrow('limited');
  });
  it('preserves resolved getSession errors as no session', async () => {
    const { repository, auth } = setup(); auth.getSession.mockResolvedValue({ data: { session: null }, error: Error('invalid') });
    expect(await repository.getSession()).toBeNull();
  });
  it('retains resolved profile/address read fallbacks and owner predicates', async () => {
    const { repository, chain } = setup(); chain.single.mockResolvedValue({ data: null, error: Error('denied') });
    chain.then.mockImplementation((resolve: (value: unknown) => void) => Promise.resolve({ data: null, error: Error('denied') }).then(resolve));
    expect(await repository.profile('owner')).toBeNull();
    expect(await repository.addresses('owner')).toEqual([]);
    expect(chain.eq.mock.calls).toEqual([['id', 'owner'], ['user_id', 'owner']]);
  });
  it.each([{ data: true, error: null, allowed: true }, { data: false, error: null, allowed: false }, { data: 'true', error: null, allowed: false }, { data: true, error: Error('denied'), allowed: false }])('keeps role checks strict and closed on error ($allowed)', async ({ data, error, allowed }) => {
    const { repository, rpc } = setup(); rpc.mockResolvedValue({ data, error });
    expect(await repository.isAdmin('owner')).toBe(allowed);
    expect(rpc).toHaveBeenCalledWith('has_role', { _user_id: 'owner', _role: 'admin' });
  });
});

it('propagates an SDK signout refusal rather than inventing success', async () => {
 const { repository, auth } = setup(); auth.signOut.mockResolvedValueOnce({ error: { message: 'refused' } }).mockResolvedValueOnce({ error: null });
 await expect(repository.signOut()).rejects.toThrow('refused'); await expect(repository.signOut()).resolves.toBeUndefined();
});
