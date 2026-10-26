import {parseInventoryPage,type InventoryRow} from './inventory';
export const VARIANT_PAGE_SIZE=50;
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function variantPageIds(productId:string,after:string|null){
 if(!uuid.test(productId)||after!==null&&!uuid.test(after))throw Error('شناسهٔ صفحهٔ تنوع معتبر نیست.');
 return{productId:productId.toLowerCase(),after:after?.toLowerCase()??null};
}
export type VariantPage={rows:InventoryRow[];hasMore:boolean;nextCursor:string|null;productName:string};
export function parseVariantPage(data:unknown,productId:string,after:string|null):VariantPage{
 const ids=variantPageIds(productId,after);
 if(!Array.isArray(data)||data.length!==1||data[0]?.id!==ids.productId||!Array.isArray(data[0]?.product_variants)||data[0].product_variants.length>VARIANT_PAGE_SIZE+1)throw Error('صفحهٔ تنوع کامل دریافت نشد.');
 const parsed=parseInventoryPage(data,1,0),rows=parsed.rows.filter(row=>row.variantId!==null);let previous=ids.after??'';
 for(const row of rows){if(row.variantId!==row.variantId!.toLowerCase()||row.variantId!<=previous)throw Error('ترتیب صفحهٔ تنوع تأیید نشد.');previous=row.variantId!;}
 const page=rows.slice(0,VARIANT_PAGE_SIZE),hasMore=rows.length>VARIANT_PAGE_SIZE;
 return{rows:page,hasMore,nextCursor:hasMore?page.at(-1)!.variantId:null,productName:data[0].name};
}
