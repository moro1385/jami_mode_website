import { validatePriceBatch, type ProductPriceTarget } from '../domain/productPrices';
import { runProductBatch } from './productBatch';
export interface ProductPriceRepository { change(target: ProductPriceTarget): Promise<void> }
export function createProductPriceService(repository: ProductPriceRepository) {
 return { update: async (targets: ProductPriceTarget[], current: () => boolean) =>
  runProductBatch(validatePriceBatch(targets), target => target.expectedPrice === target.nextPrice, target => repository.change(target), current),
 };
}
