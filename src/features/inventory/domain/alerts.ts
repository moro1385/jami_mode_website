import {adjustmentUuid,type AdjustmentRow} from './adjustments';
export const alertFilters=['all','low','zero','invalid','missing'] as const;
export type AlertFilter=typeof alertFilters[number];
export const followupFilters=['all','open','in_progress','reviewed','needs_review'] as const;
export type AlertFollowupFilter=typeof followupFilters[number];
export const assignmentFilters=['all','mine','unassigned','inactive'] as const;
export type AlertAssignmentFilter=typeof assignmentFilters[number];
export type AlertCursor={productId:string;variantId:string};
export type AlertRow=AdjustmentRow&{variantId:string;threshold:number;revision:number;alert:Exclude<AlertFilter,'all'>;entityExists:boolean;saleEnabled:boolean;followupStatus?:'open'|'in_progress'|'reviewed';followupRevision?:number;contextChanged?:boolean;assigneeId?:string|null;assignmentRevision?:number;assigneeActive?:boolean};
export type AlertPage={version:1;rows:AlertRow[];hasMore:boolean;nextCursor:AlertCursor|null;asOf:string};
export function validateAlertSelection(filter:AlertFilter,cursor:AlertCursor|null,followup:AlertFollowupFilter='all',assignment:AlertAssignmentFilter='all'){if(!assignmentFilters.includes(assignment)||!followupFilters.includes(followup)||!alertFilters.includes(filter)||(cursor&&![cursor.productId,cursor.variantId].every(adjustmentUuid)))throw Error('انتخاب فهرست هشدار معتبر نیست.');}
export function parseAlertPage(raw:unknown,filter:AlertFilter,cursor:AlertCursor|null,followup:AlertFollowupFilter='all',assignment:AlertAssignmentFilter='all',owner?:string):AlertPage{
 validateAlertSelection(filter,cursor,followup,assignment);const value=raw as AlertPage;
 if(!value||value.version!==1||!Array.isArray(value.rows)||value.rows.length>50||typeof value.hasMore!=='boolean'||(value.hasMore&&value.rows.length!==50)
  ||typeof value.asOf!=='string'||value.asOf.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(value.asOf)||!Number.isFinite(Date.parse(value.asOf)))throw Error('فهرست هشدارها تأیید نشد.');
 let previous=cursor?(cursor.productId+cursor.variantId).toLowerCase():'';
 const rows=value.rows.map(row=>{
  if(!row||![row.productId,row.variantId].every(adjustmentUuid)||row.productId!==row.productId.toLowerCase()||row.variantId!==row.variantId.toLowerCase()
   ||typeof row.productName!=='string'||!row.productName.trim()||row.productName.length>500||(['sku','size','color'] as const).some(key=>row[key]!==null&&(typeof row[key]!=='string'||row[key]!.length>500))
   ||!Number.isInteger(row.threshold)||row.threshold<0||row.threshold>100000||!Number.isInteger(row.revision)||row.revision<1||row.revision>2147483647
   ||(row.quantity!==null&&(!Number.isInteger(row.quantity)||row.quantity<0||row.quantity>2147483647))||typeof row.entityExists!=='boolean'||typeof row.saleEnabled!=='boolean')throw Error('ردیف هشدار معتبر نیست.');
  const state=!row.entityExists?'missing':row.quantity===null?'invalid':row.quantity===0?'zero':row.quantity<=row.threshold?'low':'ok';
  const key=row.productId+row.variantId;if(key<=previous||state==='ok'||row.alert!==state||(filter!=='all'&&row.alert!==filter)||(!row.entityExists&&(row.quantity!==null||row.saleEnabled)))throw Error('ترتیب یا محتوای هشدارها تأیید نشد.');previous=key;
  const enriched=['followupStatus','followupRevision','contextChanged'].some(k=>Object.prototype.hasOwnProperty.call(row,k));
  if(followup!=='all'&&!enriched)throw Error('وضعیت پیگیری از سرور دریافت نشد.');
  if(enriched&&(!['open','in_progress','reviewed'].includes(row.followupStatus!)||!Number.isInteger(row.followupRevision)||row.followupRevision!<0||row.followupRevision!>2147483647||typeof row.contextChanged!=='boolean'||(row.contextChanged&&(row.followupRevision===0||row.followupStatus!=='open'))||(!row.entityExists&&row.followupStatus!=='open')||(row.followupRevision===0&&row.followupStatus!=='open')||(followup!=='all'&&(followup==='needs_review'?!row.contextChanged:row.followupStatus!==followup))))throw Error('وضعیت پیگیری با فیلتر یا شرایط هشدار سازگار نیست.');
  const assigned=['assigneeId','assignmentRevision','assigneeActive'].some(k=>Object.prototype.hasOwnProperty.call(row,k));
  if(assignment!=='all'&&!assigned)throw Error('مسئول پیگیری دریافت نشد.');
  if(assigned&&((row.assigneeId!==null&&!adjustmentUuid(row.assigneeId))||!Number.isInteger(row.assignmentRevision)||row.assignmentRevision!<0||row.assignmentRevision!>2147483647||typeof row.assigneeActive!=='boolean'||(row.assigneeId===null&&row.assigneeActive)||(row.assignmentRevision===0&&row.assigneeId!==null)||(assignment==='mine'&&(!adjustmentUuid(owner)||row.assigneeId!==owner||!row.assigneeActive))||(assignment==='unassigned'&&row.assigneeId!==null)||(assignment==='inactive'&&(row.assigneeId===null||row.assigneeActive))))throw Error('مسئول با فیلتر یا اطلاعات هشدار سازگار نیست.');
  const base=Object.fromEntries(['productId','variantId','productName','sku','size','color','quantity','threshold','revision','alert','entityExists','saleEnabled'].map(key=>[key,row[key as keyof AlertRow]])) as AlertRow;const result=enriched?{...base,followupStatus:row.followupStatus,followupRevision:row.followupRevision,contextChanged:row.contextChanged}:base;return assigned?{...result,assigneeId:row.assigneeId,assignmentRevision:row.assignmentRevision,assigneeActive:row.assigneeActive}:result;
 });
 const last=rows.at(-1),nextCursor=value.hasMore?{productId:last!.productId,variantId:last!.variantId}:null;
 if((nextCursor===null&&value.nextCursor!==null)||(nextCursor!==null&&(!value.nextCursor||Object.keys(value.nextCursor).length!==2||value.nextCursor.productId!==nextCursor.productId||value.nextCursor.variantId!==nextCursor.variantId)))throw Error('ادامهٔ فهرست هشدار تأیید نشد.');
 return{version:1,rows,hasMore:value.hasMore,nextCursor,asOf:value.asOf};
}
