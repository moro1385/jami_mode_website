import { describe, it, expect, vi } from 'vitest';
import { createOrdersService, type OrdersRepository } from './application/ordersService';
import { createSupabaseOrdersRepository } from './infrastructure/supabaseOrdersRepository';
import type { AccountOrderRecord } from './domain/order';

const record: AccountOrderRecord = {
  id: 'abcd-123', user_id: 'owner', created_at: '2026-01-01', total_amount: 1200, status: 'confirmed',
  order_items: [{ title: 'Historical product', variant_title: 'Historical size', price: 600, quantity: 2 }],
};
function repository() {
  return { listAdmin: vi.fn(), changeStatus: vi.fn(), listAccount: vi.fn().mockResolvedValue([record]), details: vi.fn() } satisfies OrdersRepository;
}
function adapter(result: { data: unknown; error: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), order: vi.fn(), single: vi.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.update.mockReturnValue(chain);
  chain.order.mockResolvedValue(result); chain.single.mockResolvedValue(result);
  const from = vi.fn().mockReturnValue(chain);
  const client = { from } as unknown as Parameters<typeof createSupabaseOrdersRepository>[0];
  return { repository: createSupabaseOrdersRepository(client), chain, from };
}
describe('order use cases and preserved financial boundaries', () => {
  it.each(['pending_payment', 'payment_failed', 'pending', 'cancelled', 'unknown'])('rejects fulfillment edits from %s', async status => {
    const port = repository();
    await expect(createOrdersService(port).changeStatus('order', status, 'shipped')).rejects.toThrow();
    expect(port.changeStatus).not.toHaveBeenCalled();
  });
  it.each(['paid', 'confirmed', 'pending_payment'])('cannot promote fulfillment to financial state %s', async status => {
    const port = repository();
    await expect(createOrdersService(port).changeStatus('order', 'processing', status)).rejects.toThrow();
    expect(port.changeStatus).not.toHaveBeenCalled();
  });
  it('ignores same-status edits and forwards allowed transitions with their original state', async () => {
    const port = repository(); const service = createOrdersService(port);
    await service.changeStatus('order', 'confirmed', 'confirmed');
    expect(port.changeStatus).not.toHaveBeenCalled();
    await service.changeStatus('order', 'confirmed', 'shipped');
    expect(port.changeStatus).toHaveBeenCalledWith('order', 'confirmed', 'shipped');
  });
  it('keeps frozen item names, price and quantity, and confirmed delivery presentation', async () => {
    const service = createOrdersService(repository());
    expect((await service.listAccount('owner'))[0]).toMatchObject({
      number: 'ABCD', total: 1200, currencyCode: 'IRR', deliveryStatus: 'در حال پردازش',
      lines: [{ title: 'Historical product', variant: 'Historical size', price: 600, quantity: 2 }],
    });
  });
  it('rejects cross-owner rows and an empty owner before a query', async () => {
    const port = repository(); const service = createOrdersService(port);
    await expect(service.listAccount('')).rejects.toThrow('owner required');
    expect(port.listAccount).not.toHaveBeenCalled();
    await expect(service.listAccount('other')).rejects.toThrow('owner mismatch');
  });
  it('rejects mismatched detail snapshots', async () => {
    const port = repository();
    port.details.mockResolvedValue({ order: { id: 'order' }, items: [{ order_id: 'other' }] });
    await expect(createOrdersService(port).details('order')).rejects.toThrow('snapshot mismatch');
  });
  it('retains both ID and previous-status predicates and only updates status', async () => {
    const { repository, chain } = adapter({ data: { id: 'order' }, error: null });
    await repository.changeStatus('order', 'confirmed', 'shipped');
    expect(chain.update).toHaveBeenCalledWith({ status: 'shipped' });
    expect(chain.eq.mock.calls).toEqual([['id', 'order'], ['status', 'confirmed']]);
    expect(chain.select).toHaveBeenCalledWith('id');
  });
  it.each([{ data: null, error: null }, { data: null, error: Error('denied') }])('rejects unpersisted writes', async result => {
    await expect(adapter(result).repository.changeStatus('order', 'confirmed', 'shipped')).rejects.toThrow();
  });
  it('binds account reads to the owner and retains snapshot selection and ordering', async () => {
    const { repository, chain } = adapter({ data: [record], error: null });
    await repository.listAccount('owner');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'owner');
    expect(chain.select).toHaveBeenCalledWith('*,order_items(*)');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
