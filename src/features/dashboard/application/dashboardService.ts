export type DashboardRecords = { products: number | null; users: number | null; orders: number | null; amounts: { total_amount: number | null }[] };
export interface DashboardRepository { read(): Promise<DashboardRecords>; }
export function createDashboardService(repository: DashboardRepository) {
  return { async summary() {
    const records = await repository.read();
    return { products: records.products || 0, users: records.users || 0, orders: records.orders || 0,
      revenue: records.amounts.reduce((sum, order) => sum + (order.total_amount || 0), 0) };
  } };
}
