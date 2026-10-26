import { validateStatusBatch, type ProductStatusTarget } from '../domain/productManagement';
import { runProductBatch, type ProductBatchReport } from './productBatch';
export interface ProductStatusRepository { change(target: ProductStatusTarget, active: boolean): Promise<void> }
export type ProductStatusReport = ProductBatchReport;
export function createProductStatusService(repository: ProductStatusRepository) {
 return { update: async (targets: ProductStatusTarget[], active: boolean, current: () => boolean) =>
  runProductBatch(validateStatusBatch(targets, active), target => target.expectedActive === active, target => repository.change(target, active), current),
 };
}
