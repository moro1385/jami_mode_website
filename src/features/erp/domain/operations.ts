export type Operation={resource:'order'|'return'|'refund'|'ticket'|'cost';entityId:string;expected:string;next:string;reason:string;detail:string|null;amount:number|null;idempotencyKey:string};
export type ErpRow={id:string;[key:string]:unknown};
export type ErpPage={rows:ErpRow[];hasMore:boolean;nextCursor:string|null};
export const resources=['costs','orders','returns','customers','addresses','tickets','messages','activity','operations'] as const;
export type Resource=typeof resources[number];
export function nextSteps(resource:Resource,row:ErpRow):string[]{
 if(resource==='costs')return['recorded'];
 const state=String(row.status??'');
 if(resource==='orders')return row.paymentState==='paid'?({confirmed:['processing','cancelled'],processing:['shipped','cancelled'],shipped:['delivered']}[state]??[]):[];
 if(resource==='returns')return({pending:['approved','rejected'],approved:['received'],received:['closed']}[state]??[]);
 if(resource==='tickets')return state==='pending'?['resolved']:state==='resolved'?['pending']:[];return[];
}
export function refundSteps(row:ErpRow):string[]{if(row.paymentState!=='paid')return[];return({none:['requested'],requested:['approved','rejected'],approved:['externally_recorded']}[String(row.refundState)]??[]);}
export function createOperation(resource:Resource,row:ErpRow,next:string,reason:string,detail:string,amount:string,refund=false):Operation{
 if(!(refund?refundSteps(row):nextSteps(resource,row)).includes(next)||reason.trim().length<3||reason.trim().length>500||[...reason+detail].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||detail.length>200)throw Error('عملیات یا دلیل معتبر نیست.');
 const target=resource==='costs'?'cost':refund?'refund':resource==='orders'?'order':resource==='returns'?'return':'ticket';const money=refund||resource==='costs'?Number(amount):null;
 if(resource==='costs'&&(!/^\d+$/.test(amount)||!Number.isSafeInteger(money)||money!<0||money!>99999999))throw Error('بهای خرید ریالی معتبر نیست.');
 if(refund&&(!/^\d+$/.test(amount)||!Number.isSafeInteger(money)||money!<1||money!>Number(row.amount)))throw Error('مبلغ ریالی بازپرداخت معتبر نیست.');
 if((next==='shipped'||next==='externally_recorded')&&detail.trim().length<3)throw Error('کد رهگیری یا مرجع مدرک لازم است.');
 return{resource:target,entityId:row.id,expected:resource==='costs'?String(row.revision):refund?String(row.refundState)+':'+String(row.refundRevision):resource==='returns'?String(row.status)+':'+String(row.revision):String(row.status),next,reason:reason.trim(),detail:detail.trim()||null,amount:money,idempotencyKey:crypto.randomUUID()};
}
export function csvCell(value:unknown){const text=String(value??'');return '"'+(/^[\s]*[=+\-@\t\r\n]/.test(text)?"'"+text:text).split('"').join('""')+'"';}
export function pageCsv(rows:ErpRow[]){const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].sort();return '\ufeff'+[keys.map(csvCell).join(','),...rows.map(row=>keys.map(k=>csvCell(typeof row[k]==='object'?JSON.stringify(row[k]):row[k])).join(','))].join('\r\n');}

export function salesCsv(report:{from:string;to:string;currency:string;paidOrders:string;paidTotal:string;shippingTotal:string;unpaidOrLegacy:string;recordedExternalRefunds:string;grossProfit:string|null;topProducts:{product_id:string|null;units:string;amount:string}[]}){
 const rows:ErpRow[]=[{id:'summary',fromUtc:report.from,toUtcExclusive:report.to,currency:report.currency,paidOrders:report.paidOrders,paidTotal:report.paidTotal,shippingIncluded:report.shippingTotal,unpaidOrLegacyExcluded:report.unpaidOrLegacy,manualRefundEvidenceNotBankConfirmed:report.recordedExternalRefunds,grossItemMarginBeforeRefundTaxFees:report.grossProfit??'UNKNOWN_PURCHASE_COSTS',basis:'order creation; current paid-v2 state'}];
 for(const item of report.topProducts)rows.push({id:item.product_id??'deleted-reference',kind:'top-product-maximum-20',units:item.units,itemAmount:item.amount});return pageCsv(rows);
}
