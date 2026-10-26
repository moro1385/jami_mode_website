import { imagesEqual, validateImageBatch, type ProductImageTarget } from '../domain/productImageBatches';
import { runProductBatch } from './productBatch';
export interface ProductImageBatchRepository { change(target: ProductImageTarget): Promise<void> }
export function createProductImageBatchService(repository: ProductImageBatchRepository) {
 return { update: async (targets: ProductImageTarget[], current: () => boolean) =>
  runProductBatch(validateImageBatch(targets), target => imagesEqual(target.expected, target.next), target => repository.change(target), current),
 };
}
