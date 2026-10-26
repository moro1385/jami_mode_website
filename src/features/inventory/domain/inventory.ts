export const INVENTORY_PAGE_SIZE = 50;
export const INVENTORY_VARIANT_LIMIT = 200;
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export type InventoryRow = { productId: string; productName: string; active: boolean; markedOut: boolean; variantId: string | null; sku: string | null; size: string | null; color: string | null; quantity: number | null; truncated: boolean };
export type InventoryPage = { rows: InventoryRow[]; totalProducts: number; productCount: number; offset: number; truncatedProducts: number };
export type InventoryFilter = 'all' | 'low' | 'zero' | 'invalid' | 'missing-sku' | 'duplicate-sku' | 'no-variant';
export const normalizeInventoryText = (value: string) => value.replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,digit=>String(digit.charCodeAt(0)-1776)).replace(/[٠-٩]/g,digit=>String(digit.charCodeAt(0)-1632)).trim().toLocaleLowerCase();
export function inventoryOffset(value: number) {
 if (!Number.isSafeInteger(value) || value < 0 || value > 2_000_000_000 || value % INVENTORY_PAGE_SIZE) throw Error('صفحهٔ انبار معتبر نیست.');
 return value;
}
export function lowStockThreshold(value: string): number {
 const normalized=normalizeInventoryText(value);
 if (!/^\d{1,6}$/.test(normalized) || Number(normalized)>100_000) throw Error('حد کمبود باید عدد صحیح از صفر تا ۱۰۰۰۰۰ باشد.');
 return Number(normalized);
}
export function parseInventoryPage(value: unknown, count: unknown, offset: number): InventoryPage {
 inventoryOffset(offset);
 if (!Array.isArray(value) || value.length>INVENTORY_PAGE_SIZE || !Number.isSafeInteger(count) || Number(count)<0) throw Error('پاسخ انبار تأیید نشد.');
 if (value.length !== Math.min(INVENTORY_PAGE_SIZE, Math.max(0, Number(count)-offset))) throw Error('فهرست این صفحه کامل دریافت نشد؛ دوباره بارگیری کنید.');
 const rows: InventoryRow[]=[], products=new Set<string>(), variants=new Set<string>(); let truncatedProducts=0;
 for(const product of value){
  if (!product || !uuid.test(product.id) || products.has(product.id.toLowerCase()) || typeof product.name!=='string' || !product.name.trim() || typeof product.is_active!=='boolean' || typeof product.is_out_of_stock!=='boolean' || !Array.isArray(product.product_variants) || product.product_variants.length>INVENTORY_VARIANT_LIMIT+1) throw Error('اطلاعات محصول یا تنوع انبار معتبر نیست.');
  products.add(product.id.toLowerCase());
  const truncated=product.product_variants.length>INVENTORY_VARIANT_LIMIT; if(truncated)truncatedProducts++;
  const base={productId:product.id,productName:product.name,active:product.is_active,markedOut:product.is_out_of_stock,truncated};
  if(!product.product_variants.length)rows.push({...base,variantId:null,sku:null,size:null,color:null,quantity:null});
  for(const variant of product.product_variants.slice(0,INVENTORY_VARIANT_LIMIT)){
   if(!variant || !uuid.test(variant.id) || variants.has(variant.id.toLowerCase()) || variant.product_id!==product.id || ['sku','size','color'].some(key=>variant[key]!==null && (typeof variant[key]!=='string' || variant[key].length>500))) throw Error('شناسه یا مشخصات تنوع انبار معتبر نیست.');
   variants.add(variant.id.toLowerCase());
   const quantity=typeof variant.stock_quantity==='number' && Number.isInteger(variant.stock_quantity) && variant.stock_quantity>=0 && variant.stock_quantity<=2_147_483_647?variant.stock_quantity:null;
   rows.push({...base,variantId:variant.id,sku:variant.sku,size:variant.size,color:variant.color,quantity});
  }
 }
 return{rows,totalProducts:Number(count),productCount:value.length,offset,truncatedProducts};
}
export function inventoryOverview(rows: InventoryRow[], threshold: number){
 if(!Number.isInteger(threshold)||threshold<0||threshold>100_000)throw Error('حد کمبود معتبر نیست.');
 const counts=new Map<string,number>();
 rows.forEach(row=>{const sku=normalizeInventoryText(row.sku??'');if(row.variantId && sku)counts.set(sku,(counts.get(sku)??0)+1);});
 const duplicate=(row:InventoryRow)=>!!row.variantId && (counts.get(normalizeInventoryText(row.sku??''))??0)>1;
 const matches=(row:InventoryRow,filter:InventoryFilter)=>filter==='all'?true:filter==='no-variant'?!row.variantId:filter==='invalid'?!!row.variantId&&row.quantity===null:filter==='missing-sku'?!!row.variantId&&!row.sku?.trim():filter==='duplicate-sku'?duplicate(row):filter==='zero'?row.quantity===0:filter==='low'?row.quantity!==null&&row.quantity>0&&row.quantity<=threshold:false;
 return{duplicate,matches,summary:{variants:rows.filter(row=>row.variantId).length,low:rows.filter(row=>matches(row,'low')).length,zero:rows.filter(row=>matches(row,'zero')).length,invalid:rows.filter(row=>matches(row,'invalid')).length,noVariant:rows.filter(row=>!row.variantId).length,missingSku:rows.filter(row=>matches(row,'missing-sku')).length,duplicateSku:rows.filter(duplicate).length,knownUnits:rows.reduce((total,row)=>total+(row.quantity??0),0)}};
}
export function searchInventoryRows(rows: InventoryRow[], search: string){
 const words=normalizeInventoryText(search).split(/\s+/).filter(Boolean);
 return rows.filter(row=>words.every(word=>normalizeInventoryText([row.productName,row.sku,row.size,row.color].join(' ')).includes(word)));
}
