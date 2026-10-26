import {adjustmentUuid} from './adjustments';
export type InventoryBalance={version:1;productId:string;variantId:string;available:number|null;reserved:string;overdue:string;paid:string;released:string;legacy:string;reviewLines:string;saleEnabled:boolean;asOf:string};
export function parseInventoryBalance(value:unknown,product:string,variant:string):InventoryBalance{
 const v=value as InventoryBalance,counts=['reserved','overdue','paid','released','legacy','reviewLines'] as const;
 if(!v||v.version!==1||!adjustmentUuid(v.productId)||!adjustmentUuid(v.variantId)||v.productId!==product||v.variantId!==variant
  ||(v.available!==null&&(!Number.isInteger(v.available)||v.available<0||v.available>2147483647))
  ||counts.some(key=>typeof v[key]!=='string'||!/^(0|[1-9][0-9]{0,29})$/.test(v[key]))||BigInt(v.overdue)>BigInt(v.reserved)
  ||typeof v.saleEnabled!=='boolean'||typeof v.asOf!=='string'||v.asOf.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(v.asOf)||!Number.isFinite(Date.parse(v.asOf)))throw Error('گزارش موجودی تأیید نشد.');
 return Object.fromEntries(['version','productId','variantId','available',...counts,'saleEnabled','asOf'].map(key=>[key,v[key as keyof InventoryBalance]])) as InventoryBalance;
}
