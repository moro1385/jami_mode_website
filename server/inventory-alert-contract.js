import {inventoryUuid,inventoryTimestamp} from './inventory-contract.js';
const filters=['all','low','zero','invalid','missing'];
const assignments=['all','mine','unassigned','inactive'];
const followups=['all','open','in_progress','reviewed','needs_review'];
export function alertQueueRequest(q){
 if(!q||typeof q!=='object'||Object.keys(q).some(key=>!['filter','followup','assignment','afterProduct','afterVariant'].includes(key))||!filters.includes(q.filter??'all')||!followups.includes(q.followup===undefined?'all':q.followup)||!assignments.includes(q.assignment===undefined?'all':q.assignment)
  ||(q.afterProduct===undefined)!==(q.afterVariant===undefined)||(q.afterProduct!==undefined&&(!inventoryUuid(q.afterProduct)||!inventoryUuid(q.afterVariant))))throw Error('Invalid alert query');
 return{filter:q.filter??'all',followup:q.followup??'all',assignment:q.assignment??'all',cursor:q.afterProduct?{productId:q.afterProduct.toLowerCase(),variantId:q.afterVariant.toLowerCase()}:null};
}
export function alertQueueResult(value,query){
 if(!value||value.version!==1||!Array.isArray(value.rows)||value.rows.length>50||typeof value.hasMore!=='boolean'||(value.hasMore&&value.rows.length!==50)||!inventoryTimestamp(value.asOf))throw Error('Invalid alert page');
 let previous=query.cursor?query.cursor.productId+query.cursor.variantId:'';
 const rows=value.rows.map(row=>{
  if(!row||![row.productId,row.variantId].every(inventoryUuid)||row.productId!==row.productId.toLowerCase()||row.variantId!==row.variantId.toLowerCase()
   ||typeof row.productName!=='string'||!row.productName.trim()||row.productName.length>500||['sku','size','color'].some(key=>row[key]!==null&&(typeof row[key]!=='string'||row[key].length>500))
   ||!Number.isInteger(row.threshold)||row.threshold<0||row.threshold>100000||!Number.isInteger(row.revision)||row.revision<1||row.revision>2147483647
   ||(row.quantity!==null&&(!Number.isInteger(row.quantity)||row.quantity<0||row.quantity>2147483647))||typeof row.entityExists!=='boolean'||typeof row.saleEnabled!=='boolean')throw Error('Invalid alert row');
  const state=!row.entityExists?'missing':row.quantity===null?'invalid':row.quantity===0?'zero':row.quantity<=row.threshold?'low':'ok';
  const key=row.productId+row.variantId;if(key<=previous||state==='ok'||row.alert!==state||(query.filter!=='all'&&row.alert!==query.filter)||(!row.entityExists&&(row.quantity!==null||row.saleEnabled)))throw Error('Inconsistent alert page');previous=key;
  const enriched=Object.hasOwn(row,'followupStatus')||Object.hasOwn(row,'followupRevision')||Object.hasOwn(row,'contextChanged');
  if((query.withFollowup||query.followup&&query.followup!=='all')&&!enriched)throw Error('Followup metadata missing');
  if(enriched&&(!['open','in_progress','reviewed'].includes(row.followupStatus)||!Number.isInteger(row.followupRevision)||row.followupRevision<0||row.followupRevision>2147483647||typeof row.contextChanged!=='boolean'||(row.contextChanged&&(row.followupRevision===0||row.followupStatus!=='open'))||(!row.entityExists&&row.followupStatus!=='open')||(row.followupRevision===0&&row.followupStatus!=='open')||(query.followup&&query.followup!=='all'&&(query.followup==='needs_review'?!row.contextChanged:row.followupStatus!==query.followup))))throw Error('Invalid followup metadata');
  const assigned=['assigneeId','assignmentRevision','assigneeActive'].some(k=>Object.hasOwn(row,k));
  if((query.withAssignment||query.assignment&&query.assignment!=='all')&&!assigned)throw Error('Assignment metadata missing');
  if(assigned&&((row.assigneeId!==null&&!inventoryUuid(row.assigneeId))||!Number.isInteger(row.assignmentRevision)||row.assignmentRevision<0||row.assignmentRevision>2147483647||typeof row.assigneeActive!=='boolean'||(row.assigneeId===null&&row.assigneeActive)||(row.assignmentRevision===0&&row.assigneeId!==null)||(query.assignment==='mine'&&(row.assigneeId!==query.actor||!row.assigneeActive))||(query.assignment==='unassigned'&&row.assigneeId!==null)||(query.assignment==='inactive'&&(row.assigneeId===null||row.assigneeActive))))throw Error('Inconsistent assignment metadata');
  const base=Object.fromEntries(['productId','variantId','productName','sku','size','color','quantity','threshold','revision','alert','entityExists','saleEnabled'].map(key=>[key,row[key]]));const result=enriched?{...base,followupStatus:row.followupStatus,followupRevision:row.followupRevision,contextChanged:row.contextChanged}:base;return assigned?{...result,assigneeId:row.assigneeId,assignmentRevision:row.assignmentRevision,assigneeActive:row.assigneeActive}:result;
 });
 const last=rows.at(-1);return{version:1,rows,hasMore:value.hasMore,nextCursor:value.hasMore?{productId:last.productId,variantId:last.variantId}:null,asOf:value.asOf};
}
