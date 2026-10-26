export const inventoryUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const quantity=value=>Number.isInteger(value)&&value>=0&&value<=2147483647;
const label=value=>value===null||(typeof value==='string'&&value.length<=500);
const reason=value=>typeof value==='string'&&value.trim().length>=3&&value.trim().length<=500&&![...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);
export const inventoryTimestamp=value=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
export function inventoryAdjustmentRequest(body){
 if(!exact(body,['productId','variantId','expected','delta','reason','idempotencyKey'])||!inventoryUuid(body.productId)||!inventoryUuid(body.variantId)||!inventoryUuid(body.idempotencyKey)
  ||!exact(body.expected,['quantity','sku','size','color'])||!quantity(body.expected.quantity)||!['sku','size','color'].every(key=>label(body.expected[key]))
  ||!Number.isInteger(body.delta)||!body.delta||Math.abs(body.delta)>1000000||!quantity(body.expected.quantity+body.delta)||!reason(body.reason))throw Error('Invalid inventory adjustment');
 return{productId:body.productId.toLowerCase(),variantId:body.variantId.toLowerCase(),expected:{quantity:body.expected.quantity,sku:body.expected.sku,size:body.expected.size,color:body.expected.color},delta:body.delta,reason:body.reason.trim(),idempotencyKey:body.idempotencyKey.toLowerCase()};
}
export function inventoryAdjustmentEntry(value){
 if(!object(value)||!['id','requestId','actorId','productId','variantId'].every(key=>inventoryUuid(value[key]))||!quantity(value.before)||!quantity(value.after)
  ||!Number.isInteger(value.delta)||!value.delta||Math.abs(value.delta)>1000000||value.after!==value.before+value.delta||!reason(value.reason)||value.reason!==value.reason.trim()
  ||!inventoryTimestamp(value.createdAt)||!['sku','size','color'].every(key=>label(value[key])))throw Error('Unconfirmed inventory result');
 return Object.fromEntries(['id','requestId','actorId','productId','variantId','before','after','delta','reason','createdAt','sku','size','color'].map(key=>[key,value[key]]));
}
export function inventoryHistoryRequest(query){
 if(!object(query)||Object.keys(query).some(key=>!['productId','variantId','before','beforeId'].includes(key))||!inventoryUuid(query.productId)||!inventoryUuid(query.variantId)
  ||(query.before===undefined)!==(query.beforeId===undefined)||(query.before!==undefined&&(!inventoryTimestamp(query.before)||!inventoryUuid(query.beforeId))))throw Error('Invalid history request');
 return{productId:query.productId.toLowerCase(),variantId:query.variantId.toLowerCase(),before:query.before??null,beforeId:query.beforeId?.toLowerCase()??null};
}
