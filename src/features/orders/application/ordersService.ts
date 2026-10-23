import { fulfillmentOptions } from '../domain/fulfillment';
import { accountOrder, type AccountOrderRecord, type AdminOrder, type OrderDetails } from '../domain/order';
export interface OrdersRepository {
  listAdmin(): Promise<AdminOrder[]>;
  changeStatus(id: string, previous: string, next: string): Promise<void>;
  listAccount(userId: string): Promise<AccountOrderRecord[]>;
  details(id: string): Promise<OrderDetails>;
}
export function createOrdersService(repository: OrdersRepository) {
  return {
    listAdmin: () => repository.listAdmin(),
    async changeStatus(id: string, previous: string, next: string) {
      if (previous === next) return;
      if (!fulfillmentOptions(previous).includes(next)) throw Error('Invalid fulfillment transition');
      await repository.changeStatus(id, previous, next);
    },
    async listAccount(userId: string) {
      if (!userId) throw Error('Order owner required');
      const records = await repository.listAccount(userId);
      if (records.some(record => record.user_id !== userId)) throw Error('Order owner mismatch');
      return records.map(accountOrder);
    },
    async details(id: string) {
      if (!id) throw Error('Order required');
      const details = await repository.details(id);
      if (details.order.id !== id || details.items.some(item => item.order_id !== id)) throw Error('Order snapshot mismatch');
      return details;
    },
  };
}
