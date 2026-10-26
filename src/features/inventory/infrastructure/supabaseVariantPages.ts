import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
import {variantPageIds,parseVariantPage,VARIANT_PAGE_SIZE} from '../domain/variantPages';
export function createSupabaseVariantPages(client:Pick<SupabaseClient<Database>,'from'>){
 return{async read(productId:string,after:string|null){
  const ids=variantPageIds(productId,after);
  let query=client.from('products').select('id,name,is_active,is_out_of_stock,product_variants(id,product_id,sku,size,color,stock_quantity)').eq('id',ids.productId).order('id',{ascending:true,referencedTable:'product_variants'}).limit(VARIANT_PAGE_SIZE+1,{referencedTable:'product_variants'});
  if(ids.after)query=query.gt('product_variants.id',ids.after);
  const {data,error}=await query.abortSignal(AbortSignal.timeout(10_000));if(error)throw error;
  return parseVariantPage(data,ids.productId,ids.after);
 }};
}
