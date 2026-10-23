import { describe, it, expect, vi } from 'vitest';
import { createSupabaseReturnsRepository } from './infrastructure/supabaseReturnsRepository';
function adapter(results: { data: unknown; error: unknown }[]) {
  const chain = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), insert: vi.fn(), order: vi.fn(), in: vi.fn(), maybeSingle: vi.fn() };
  for (const key of ['select', 'eq', 'update'] as const) chain[key].mockReturnValue(chain);
  const result = () => Promise.resolve(results.shift());
  chain.order.mockImplementation(result); chain.in.mockImplementation(result);
  chain.maybeSingle.mockImplementation(result); chain.insert.mockImplementation(result);
  const from = vi.fn().mockReturnValue(chain);
  const repository = createSupabaseReturnsRepository({ from } as unknown as Parameters<typeof createSupabaseReturnsRepository>[0]);
  return { repository, chain, from };
}
describe('return persistence adapters', () => {
  it('does not query profiles for an empty request list', async () => {
    const { repository, from } = adapter([{ data: [], error: null }]);
    expect(await repository.listAdmin()).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });
  it('merges profiles by owner with the existing missing-profile fallback', async () => {
    const { repository, chain } = adapter([
      { data: [{ id: 'first', user_id: 'A' }, { id: 'second', user_id: 'B' }], error: null },
      { data: [{ id: 'A', first_name: 'Name', last_name: null, phone: null }], error: null },
    ]);
    const result = await repository.listAdmin();
    expect(chain.in).toHaveBeenCalledWith('id', ['A', 'B']);
    expect(result[0].profiles.first_name).toBe('Name');
    expect(result[1].profiles).toEqual({ first_name: null, last_name: null, phone: null });
  });
  it.each([null, { id: 'return', status: 'pending' }])('does not accept a missing or differently saved status', async data => {
    const { repository } = adapter([{ data, error: null }]);
    await expect(repository.changeStatus('return', 'approved')).rejects.toThrow('not saved');
  });
  it('confirms the persisted status before success', async () => {
    const { repository, chain } = adapter([{ data: { id: 'return', status: 'approved' }, error: null }]);
    await repository.changeStatus('return', 'approved');
    expect(chain.update).toHaveBeenCalledWith({ status: 'approved' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'return');
  });
  it('filters return order selection by owner', async () => {
    const { repository, chain } = adapter([{ data: [{ id: 'abcd-123', created_at: '2026-01-01' }], error: null }]);
    expect(await repository.listOrders('owner')).toEqual([{ id: 'abcd-123', number: 'ABCD', createdAt: '2026-01-01' }]);
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'owner');
  });
  it('propagates rejected inserts so the form can clean uploaded images', async () => {
    const { repository } = adapter([{ data: null, error: Error('denied') }]);
    await expect(repository.insert({ user_id: 'owner', order_id: 'order', phone: 'phone', description: 'reason', image_urls: ['owner/file.png'] })).rejects.toThrow('denied');
  });
});
