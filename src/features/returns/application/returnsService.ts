import type { ReturnRequest, ReturnSubmission, ReturnOrder } from '../domain/returnRequest';
export interface ReturnsRepository {
  listAdmin(): Promise<ReturnRequest[]>;
  changeStatus(id: string, status: string): Promise<void>;
  listOrders(userId: string): Promise<ReturnOrder[]>;
  insert(request: ReturnSubmission): Promise<void>;
}
export function createReturnsService(repository: ReturnsRepository) {
  return {
    listAdmin: () => repository.listAdmin(),
    changeStatus: (id: string, status: string) => repository.changeStatus(id, status),
    listOrders(userId: string) {
      if (!userId) throw Error('Order owner required');
      return repository.listOrders(userId);
    },
    submit: (request: ReturnSubmission) => repository.insert(request),
  };
}
