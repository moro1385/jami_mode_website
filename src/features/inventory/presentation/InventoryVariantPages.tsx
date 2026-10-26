import {useCallback,useState} from 'react';
import {adminInventoryVariantPages} from '../admin';
import type {InventoryRow} from '../domain/inventory';
import {useScopedAsyncRead} from '@/shared/presentation/useScopedAsyncRead';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {InventoryAdjustmentControls} from './InventoryAdjustmentControls';
import {InventoryBalanceDialog} from './InventoryBalanceDialog';
import {InventoryPolicyDialog} from './InventoryPolicyDialog';
export function InventoryVariantPages({ownerId,productId,close,refresh}:{ownerId:string;productId:string;close():void;refresh():void}){
 const [cursors,setCursors]=useState<(string|null)[]>([null]),[action,setAction]=useState<{row:InventoryRow;kind:'adjust'|'balance'|'policy'}>();const after=cursors.at(-1)!;
 const scope=JSON.stringify([ownerId,productId,after]),load=useCallback(()=>adminInventoryVariantPages.read(productId,after),[productId,after]);const read=useScopedAsyncRead(scope,load);
 const closeAction=()=>{setAction(undefined);read.retry();refresh();};
 return <><Dialog open onOpenChange={open=>{if(!open&&!action)close();}}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>همهٔ تنوع‌های محصول</DialogTitle><DialogDescription>تنوع‌ها در صفحه‌های ۵۰تایی خوانده می‌شوند؛ محدودیت ۲۰۰ ردیفِ خلاصه مانع دسترسی به بقیه نیست. هر صفحه وضعیت همان لحظه است.</DialogDescription></DialogHeader>
 <div className="space-y-3 max-h-[65vh] overflow-auto"><div className="flex gap-2"><Button variant="outline" disabled={read.loading} onClick={read.retry}>بازخوانی تنوع‌های محصول</Button><Button variant="outline" disabled={read.loading} onClick={()=>{setCursors([null]);read.retry();}}>شروع دوباره از اولین تنوع</Button></div>
 {read.loading?<p role="status">در حال خواندن تنوع‌ها…</p>:read.error?<p role="alert">تنوع‌ها دریافت نشدند؛ فهرست خالی فرض نمی‌شود.</p>:read.value?<><h3>{read.value.productName}</h3>{!read.value.rows.length?<p>تنوعی در این صفحه وجود ندارد.</p>:<ul className="space-y-3">{read.value.rows.map(row=><li key={row.variantId} className="border rounded p-3"><p>{row.sku||'کد SKU خالی'}؛ {row.size||'—'} / {row.color||'—'}؛ موجودی: {row.quantity===null?'نامعتبر':row.quantity.toLocaleString('fa-IR')}</p><bdi className="text-xs">{row.variantId}</bdi><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setAction({row,kind:'adjust'})}>اصلاح و تاریخچهٔ تنوع</Button><Button variant="outline" onClick={()=>setAction({row,kind:'balance'})}>تفکیک موجودی تنوع</Button><Button variant="outline" onClick={()=>setAction({row,kind:'policy'})}>حد کمبود تنوع</Button></div></li>)}</ul>}</>:null}
 </div><nav aria-label="صفحه‌بندی تنوع‌های محصول" className="flex gap-3"><Button disabled={read.loading||cursors.length===1} onClick={()=>setCursors(p=>p.slice(0,-1))}>تنوع‌های قبلی</Button><Button disabled={read.loading||!!read.error||!read.value?.nextCursor} onClick={()=>{const next=read.value?.nextCursor;if(next)setCursors(p=>[...p,next]);}}>تنوع‌های بعدی</Button></nav></DialogContent></Dialog>
 {action?.kind==='adjust'&&<InventoryAdjustmentControls key={action.row.variantId} ownerId={ownerId} row={action.row} close={closeAction} refresh={()=>{read.retry();refresh();}}/>}
 {action?.kind==='balance'&&<InventoryBalanceDialog key={action.row.variantId} ownerId={ownerId} row={action.row} close={closeAction}/>}
 {action?.kind==='policy'&&<InventoryPolicyDialog key={action.row.variantId} ownerId={ownerId} row={action.row} close={closeAction}/>}
 </>;
}
