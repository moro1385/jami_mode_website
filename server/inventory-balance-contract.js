import {inventoryUuid,inventoryTimestamp} from './inventory-contract.js';
export function inventoryBalanceResult(value,product,variant){
 const counts=['reserved','overdue','paid','released','legacy','reviewLines'];
 if(!value||value.version!==1||!inventoryUuid(value.productId)||!inventoryUuid(value.variantId)||value.productId!==product||value.variantId!==variant
  ||(value.available!==null&&(!Number.isInteger(value.available)||value.available<0||value.available>2147483647))
  ||counts.some(key=>typeof value[key]!=='string'||!/^(0|[1-9][0-9]{0,29})$/.test(value[key]))||BigInt(value.overdue)>BigInt(value.reserved)
  ||typeof value.saleEnabled!=='boolean'||!inventoryTimestamp(value.asOf))throw Error('Invalid inventory balance');
 return Object.fromEntries(['version','productId','variantId','available',...counts,'saleEnabled','asOf'].map(key=>[key,value[key]]));
}
