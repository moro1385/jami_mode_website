import { describe, it, expect, vi } from 'vitest';
import { createDashboardService } from './application/dashboardService';
import { createSupabaseDashboardRepository } from './infrastructure/supabaseDashboardRepository';
describe('dashboard data boundaries', () => {
  it('retains the all-order amount sum rather than inventing settled revenue', async () => {
    const service = createDashboardService({ read: vi.fn().mockResolvedValue({ products: 3, users: 2, orders: 2, amounts: [{ total_amount: 100 }, { total_amount: 200 }] }) });
    expect(await service.summary()).toEqual({ products: 3, users: 2, orders: 2, revenue: 300 });
  });
  it.each(['products', 'orders', 'profiles'])('propagates %s query failure instead of zero-looking success', async failed => {
    const from = vi.fn((table: string) => ({ select: vi.fn().mockResolvedValue({ data: table === 'orders' ? [] : null, count: 0, error: table === failed ? Error('denied') : null }) }));
    const repository = createSupabaseDashboardRepository({ from } as unknown as Parameters<typeof createSupabaseDashboardRepository>[0]);
    await expect(createDashboardService(repository).summary()).rejects.toThrow('denied');
  });
});
