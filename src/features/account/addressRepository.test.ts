import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAddressRepository } from './infrastructure/supabaseAddressRepository';
const address = { label: 'home', recipient: 'Name', phone: 'phone', country: 'Iran', city: 'City', line1: 'street', postalCode: '123', isDefault: false };
function setup(result: { data?: unknown; error: unknown }) {
  const chain = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), neq: vi.fn(), select: vi.fn(), single: vi.fn(), then: vi.fn() };
  for (const key of ['insert', 'update', 'delete', 'eq', 'neq', 'select'] as const) chain[key].mockReturnValue(chain);
  chain.single.mockResolvedValue(result);
  chain.then.mockImplementation((resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve));
  const from = vi.fn().mockReturnValue(chain);
  return { repository: createSupabaseAddressRepository({ from } as unknown as Parameters<typeof createSupabaseAddressRepository>[0]), chain };
}
describe('owner-bound address persistence', () => {
  it.each(['edit', 'remove', 'default'])('binds both ID and owner for %s', async operation => {
    const { repository, chain } = setup({ data: { id: 'target' }, error: null });
    if (operation === 'edit') await repository.save('owner', 'target', address, false);
    if (operation === 'remove') await repository.remove('owner', 'target');
    if (operation === 'default') await repository.markDefault('owner', 'target');
    expect(chain.eq.mock.calls).toEqual([['id', 'target'], ['user_id', 'owner']]);
    expect(chain.select).toHaveBeenCalledWith('id');
  });
  it.each([null, { id: 'wrong' }])('rejects missing or unexpected saved target', async data => {
    const { repository } = setup({ data, error: null });
    await expect(repository.remove('owner', 'target')).rejects.toThrow('not saved');
  });
  it('propagates denied saves without reporting success', async () => {
    const { repository } = setup({ data: null, error: Error('denied') });
    await expect(repository.save('owner', 'new', address, true)).rejects.toThrow('denied');
  });
  it('binds a new address to the signed-in owner with explicit allowed fields', async () => {
    const { repository, chain } = setup({ data: { id: 'new' }, error: null });
    await repository.save('owner', 'new', address, true);
    expect(chain.insert).toHaveBeenCalledWith({ id: 'new', user_id: 'owner', label: 'home', recipient: 'Name', phone: 'phone', country: 'Iran', city: 'City', line1: 'street', is_default: false, postal_code: '123', line2: null });
  });
  it('allows no default siblings but still surfaces clear errors', async () => {
    const success = setup({ data: [], error: null });
    await success.repository.clearDefaults('owner', 'target');
    expect(success.chain.eq).toHaveBeenCalledWith('user_id', 'owner');
    expect(success.chain.neq).toHaveBeenCalledWith('id', 'target');
    await expect(setup({ error: Error('denied') }).repository.clearDefaults('owner')).rejects.toThrow('denied');
  });
});
