import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { InventoryRepository } from '../application/inventoryService';
import { INVENTORY_PAGE_SIZE, INVENTORY_VARIANT_LIMIT, inventoryOffset } from '../domain/inventory';
export function createSupabaseInventoryRepository(client: Pick<SupabaseClient<Database>,'from'>): InventoryRepository {
 return { async read(offset) {
  inventoryOffset(offset);
  const {data,error,count}=await client.from('products')
   .select('id,name,is_active,is_out_of_stock,product_variants(id,product_id,sku,size,color,stock_quantity)',{count:'exact'})
   .order('name',{ascending:true}).order('id',{ascending:true})
   .order('id',{ascending:true,referencedTable:'product_variants'})
   .limit(INVENTORY_VARIANT_LIMIT+1,{referencedTable:'product_variants'})
   .range(offset,offset+INVENTORY_PAGE_SIZE-1).abortSignal(AbortSignal.timeout(10_000));
  if(error)throw error;
  return{data,count};
 } };
}
