import type { CustomerSummary } from '../domain/customer';

export interface CustomersRepository {
  list(): Promise<CustomerSummary[]>;
}

export function createCustomersService(repository: CustomersRepository) {
  return { list: () => repository.list() };
}
