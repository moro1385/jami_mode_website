import {inventoryUuid,inventoryTimestamp} from './inventory-contract.js';
export const policyThreshold=value=>value===null||(Number.isInteger(value)&&value>=0&&value<=100000);
const reason=value=>typeof value==='string'&&value.trim().length>=3&&value.trim().length<=500&&![...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);
export function policyRequest(value){
 const keys=['productId','variantId','expectedRevision','threshold','reason','idempotencyKey'];
 if(!value||Object.keys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(value,key))||![value.productId,value.variantId,value.idempotencyKey].every(inventoryUuid)
  ||!Number.isInteger(value.expectedRevision)||value.expectedRevision<0||value.expectedRevision>2147483646||!policyThreshold(value.threshold)||!reason(value.reason))throw Error('Invalid policy request');
 return{...value,productId:value.productId.toLowerCase(),variantId:value.variantId.toLowerCase(),idempotencyKey:value.idempotencyKey.toLowerCase(),reason:value.reason.trim()};
}
export function policyRead(value,product,variant){
 if(!value||value.version!==1||value.productId!==product||value.variantId!==variant||!policyThreshold(value.threshold)||!Number.isInteger(value.revision)||value.revision<0||value.revision>2147483647
  ||(value.available!==null&&(!Number.isInteger(value.available)||value.available<0||value.available>2147483647))||typeof value.writesEnabled!=='boolean'||typeof value.saleEnabled!=='boolean'
  ||(value.revision===0?(value.threshold!==null||value.updatedBy!==null||value.lastRequestId!==null||value.updatedAt!==null):(!inventoryUuid(value.updatedBy)||!inventoryUuid(value.lastRequestId)||!inventoryTimestamp(value.updatedAt))))throw Error('Invalid policy read');
 const alert=value.available===null?'invalid':value.threshold===null?'unset':value.available===0?'zero':value.available<=value.threshold?'low':'ok';if(value.alert!==alert)throw Error('Invalid alert');
 return Object.fromEntries(['version','productId','variantId','threshold','revision','updatedBy','lastRequestId','updatedAt','available','alert','saleEnabled','writesEnabled'].map(key=>[key,value[key]]));
}
export function policyReceipt(value,actor,body){
 if(!value||value.productId!==body.productId||value.variantId!==body.variantId||value.actorId!==actor||value.requestId!==body.idempotencyKey||value.revision!==body.expectedRevision+1||value.threshold!==body.threshold||value.reason!==body.reason||!policyThreshold(value.beforeThreshold)||!inventoryTimestamp(value.createdAt))throw Error('Unconfirmed policy result');
 return Object.fromEntries(['productId','variantId','actorId','requestId','revision','threshold','beforeThreshold','reason','createdAt'].map(key=>[key,value[key]]));
}
