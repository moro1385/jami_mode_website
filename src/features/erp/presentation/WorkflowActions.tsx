import {AdminBadge} from '@/components/admin/AdminPrimitives';
import {useState} from 'react';
import {nextSteps,type ErpRow} from '../domain/operations';
import {stateLabel} from '../domain/labels';
import {OperationDialog} from './OperationDialog';
import {Button} from '@/components/ui/button';
// Legacy list pages use the same confirmed, actor-bound workflow as /admin/erp.
// No browser-table fallback is offered when the ERP API/gate is unavailable.
export function WorkflowActions({owner,resource,row,refresh}:{owner:string;resource:'orders'|'tickets';row:ErpRow;refresh():void}){
 const [next,setNext]=useState<string>();const steps=nextSteps(resource,row);
 return <div className="admin-workflow-state" onClick={event=>event.stopPropagation()}><AdminBadge tone={row.status==='delivered'?'success':['pending','pending_payment','processing'].includes(String(row.status))?'warning':'neutral'}>{stateLabel(String(row.status??''))}</AdminBadge>
 {resource==='orders'&&row.paymentState!=='paid'&&<p className="sr-only">پرداخت این سفارش برای گردش جدید تأیید نشده است.</p>}
 <div className="admin-row-actions">{steps.map(state=><Button key={state} size="sm" variant="outline" onClick={()=>setNext(state)}>انتقال به {stateLabel(state)}</Button>)}</div>
 {next&&<OperationDialog key={next} owner={owner} resource={resource} row={row} next={next} refund={false} close={()=>{setNext(undefined);refresh();}}/>}
 </div>;
}
