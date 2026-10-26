import { normalizeInventoryText, type InventoryRow } from './inventory';
export type AdjustmentRow=Pick<InventoryRow,'productId'|'productName'|'variantId'|'sku'|'size'|'color'|'quantity'>;
export type AdjustmentTarget={productId:string;variantId:string;expected:{quantity:number;sku:string|null;size:string|null;color:string|null};delta:number;reason:string;idempotencyKey:string};
export type AdjustmentEntry={id:string;requestId:string;actorId:string;productId:string;variantId:string;before:number;after:number;delta:number;reason:string;createdAt:string;sku:string|null;size:string|null;color:string|null};
export const adjustmentUuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const quantity=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=2147483647;
const label=(value:unknown)=>value===null||(typeof value==='string'&&value.length<=500);
export function validateAdjustment(value:unknown):AdjustmentTarget{
 if(!object(value)||Object.keys(value).length!==6||!['productId','variantId','idempotencyKey'].every(key=>adjustmentUuid(value[key]))||!object(value.expected)||Object.keys(value.expected).length!==4||!quantity(value.expected.quantity)||!['sku','size','color'].every(key=>label((value.expected as Record<string,unknown>)[key]))||typeof value.delta!=='number'||!Number.isInteger(value.delta)||!value.delta||Math.abs(value.delta)>1000000||!quantity(value.expected.quantity+value.delta)||typeof value.reason!=='string'||value.reason.trim().length<3||value.reason.trim().length>500||[...value.reason].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))throw Error('اصلاح موجودی باید مقدار صحیح، دلیل ۳ تا ۵۰۰ نویسه و انتخاب معتبر داشته باشد.');
 return{productId:String(value.productId).toLowerCase(),variantId:String(value.variantId).toLowerCase(),idempotencyKey:String(value.idempotencyKey).toLowerCase(),expected:{quantity:value.expected.quantity,sku:value.expected.sku as string|null,size:value.expected.size as string|null,color:value.expected.color as string|null},delta:value.delta,reason:value.reason.trim()};
}
export function prepareAdjustment(row:AdjustmentRow,change:string,reason:string,key:string){
 const value=normalizeInventoryText(change);if(!/^[+-]?(0|[1-9][0-9]{0,6})$/.test(value))throw Error('افزایش یا کاهش را با عدد صحیح وارد کنید؛ برای کاهش از علامت منفی استفاده کنید.');
 return validateAdjustment({productId:row.productId,variantId:row.variantId,expected:{quantity:row.quantity,sku:row.sku,size:row.size,color:row.color},delta:Number(value),reason,idempotencyKey:key});
}
export function parseAdjustmentEntry(value:unknown):AdjustmentEntry{
 if(!object(value)||!['id','requestId','actorId','productId','variantId'].every(key=>adjustmentUuid(value[key]))||!quantity(value.before)||!quantity(value.after)||typeof value.delta!=='number'||!Number.isInteger(value.delta)||!value.delta||Math.abs(value.delta)>1000000||value.after!==value.before+value.delta||typeof value.reason!=='string'||value.reason.length<3||value.reason.length>500||typeof value.createdAt!=='string'||value.createdAt.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(value.createdAt)||!Number.isFinite(Date.parse(value.createdAt))||!['sku','size','color'].every(key=>label(value[key])))throw Error('نتیجهٔ اصلاح موجودی تأیید نشد.');
 return Object.fromEntries(['id','requestId','actorId','productId','variantId','before','after','delta','reason','createdAt','sku','size','color'].map(key=>[key,value[key]])) as AdjustmentEntry;
}
