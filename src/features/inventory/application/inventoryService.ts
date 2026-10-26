import { inventoryOffset, parseInventoryPage } from '../domain/inventory';
export interface InventoryRepository { read(offset: number): Promise<{ data: unknown; count: unknown }> }
export function createInventoryService(repository: InventoryRepository) {
 return { async read(offset: number) { const page=inventoryOffset(offset);const response=await repository.read(page);return parseInventoryPage(response.data,response.count,page); } };
}
