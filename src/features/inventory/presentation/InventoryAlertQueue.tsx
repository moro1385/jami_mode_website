import {InventoryAssignmentDialog} from './InventoryAssignmentDialog';
import {followupLabels} from '../domain/followup';
import {InventoryFollowupDialog} from './InventoryFollowupDialog';
import {useCallback,useState} from 'react';
import {adminInventoryAlerts} from '../admin';
import type {AlertCursor,AlertFilter,AlertRow,AlertFollowupFilter,AlertAssignmentFilter} from '../domain/alerts';
import {useScopedAsyncRead} from '@/shared/presentation/useScopedAsyncRead';
import {useRequestScope} from '@/shared/presentation/useRequestScope';
import {Button} from '@/components/ui/button';
import {InventoryPolicyDialog} from './InventoryPolicyDialog';
import {InventoryAdjustmentControls} from './InventoryAdjustmentControls';
import {InventoryBalanceDialog} from './InventoryBalanceDialog';
const label={low:'کمبود موجودی',zero:'موجودی صفر',invalid:'موجودی نامعتبر',missing:'محصول یا تنوع پیدا نشد'};
export function InventoryAlertQueue({ownerId,onInventoryChange}:{ownerId:string;onInventoryChange():void}){
 const [assignment,setAssignment]=useState<AlertAssignmentFilter>('all');
 const [followup,setFollowup]=useState<AlertFollowupFilter>('all');
 const [filter,setFilter]=useState<AlertFilter>('all'),[cursors,setCursors]=useState<(AlertCursor|null)[]>([null]);
 const [selected,setSelected]=useState<{row:AlertRow;action:'policy'|'adjust'|'balance'|'followup'|'assignment'}>();
 const cursor=cursors[cursors.length-1],scope=JSON.stringify([ownerId,filter,followup,assignment,cursor]),capture=useRequestScope(scope);
 const load=useCallback(()=>assignment!=='all'?adminInventoryAlerts.read(ownerId,filter,cursor,capture(),followup,assignment):followup==='all'?adminInventoryAlerts.read(ownerId,filter,cursor,capture()):adminInventoryAlerts.read(ownerId,filter,cursor,capture(),followup),[ownerId,filter,cursor,followup,assignment,capture]);
 const read=useScopedAsyncRead(scope,load);
 const restart=()=>{setCursors([null]);read.retry();};
 const refreshAfterChange=()=>{read.retry();onInventoryChange();};
 return <section className="border rounded-xl p-4 space-y-4" aria-label="فهرست سراسری هشدار انبار"><h2 className="text-xl font-bold">هشدارهای حد ذخیره‌شده</h2>
  <p>این فهرست مستقل از صفحهٔ محصولات، همهٔ حدهای فعال ذخیره‌شده را بررسی می‌کند؛ کالاهای بدون حد یا با هشدار غیرفعال در آن نیستند. تعداد هر صفحه حداکثر ۵۰ ردیف است.</p>
  <p>هر صفحه هنگام خواندن ارزیابی می‌شود. برای دیدن هشدارهایی که تازه ایجاد شده‌اند، از ابتدا بازخوانی کنید. بازکردن این فهرست موجودی را تغییر نمی‌دهد و هشداری را رسیدگی‌شده اعلام نمی‌کند.</p>
  <p>«نیازمند بازبینی دوباره» یعنی موجودی یا حد هشدار بعد از آخرین پیگیری تغییر کرده است. بازبینی‌شده بودن، هشدار کمبود را حذف نمی‌کند.</p>
  <p>«بدون مسئول» با «مسئول غیرفعال» فرق دارد؛ مسئول غیرفعال باید دوباره تعیین شود. «هشدارهای من» فقط مسئولیت‌های ثبت‌شده برای حساب فعلی را نشان می‌دهد.</p>
  <div className="flex flex-wrap gap-3"><label>نوع هشدار<select aria-label="نوع هشدار ذخیره‌شده" className="block border rounded p-2" value={filter} onChange={e=>{setFilter(e.target.value as AlertFilter);setCursors([null]);}}><option value="all">همهٔ هشدارهای فعال</option><option value="low">کمبود موجودی</option><option value="zero">موجودی صفر</option><option value="invalid">موجودی نامعتبر</option><option value="missing">محصول یا تنوع پیدا نشد</option></select></label><label>وضعیت پیگیری<select aria-label="فیلتر وضعیت پیگیری هشدار" className="block border rounded p-2" value={followup} onChange={e=>{setFollowup(e.target.value as AlertFollowupFilter);setCursors([null]);}}><option value="all">همهٔ وضعیت‌های پیگیری</option><option value="open">باز</option><option value="in_progress">در حال پیگیری</option><option value="reviewed">بازبینی‌شده</option><option value="needs_review">نیازمند بازبینی دوباره</option></select></label><label>مسئول پیگیری<select aria-label="فیلتر مسئول پیگیری" className="block border rounded p-2" value={assignment} onChange={e=>{setAssignment(e.target.value as AlertAssignmentFilter);setCursors([null]);}}><option value="all">همهٔ مسئول‌ها</option><option value="mine">هشدارهای من</option><option value="unassigned">بدون مسئول</option><option value="inactive">مسئول غیرفعال</option></select></label><Button variant="outline" onClick={restart} disabled={read.loading}>بازخوانی هشدارها از ابتدا</Button></div>
  {read.loading?<p role="status">در حال خواندن هشدارهای ذخیره‌شده…</p>:read.error?<><p role="alert">{read.error instanceof Error?read.error.message:'فهرست دریافت نشد؛ خالی فرض نشده است.'}</p><Button variant="outline" onClick={read.retry}>تلاش دوبارهٔ فهرست هشدار</Button></>:read.value?<>
   <p className="text-xs break-all">زمان این صفحه از هشدارها: {read.value.asOf}</p>
   {!read.value.rows.length?<p>{cursor?'هشدار دیگری پس از این شناسه‌ها دیده نشد؛ برای تغییرات تازه از ابتدا بازخوانی کنید.':'برای حدهای فعال ذخیره‌شده، هشداری با این فیلتر دیده نشد.'}</p>:<ul className="space-y-3">{read.value.rows.map(row=><li key={row.productId+row.variantId} className="border rounded p-3 space-y-2"><p className="font-medium">{row.productName}؛ {row.sku||'بدون کد'}؛ {row.size||'—'} / {row.color||'—'}</p><p>{label[row.alert]}؛ مانده: {row.quantity===null?'نامعتبر یا در دسترس نیست':row.quantity.toLocaleString('fa-IR')}؛ حد ذخیره‌شده: {row.threshold.toLocaleString('fa-IR')}؛ نسخهٔ تنظیم: {row.revision}</p>
    {row.followupStatus?<p>پیگیری: {followupLabels[row.followupStatus]}؛ نسخهٔ پیگیری: {row.followupRevision}{row.contextChanged?'؛ اطلاعات انبار یا حد هشدار تغییر کرده؛ بازبینی دوباره لازم است.':''}</p>:<p>وضعیت پیگیری در دسترس نیست.</p>}
    {row.assigneeId!==undefined?<p>مسئول: {row.assigneeId===null?'بدون مسئول':row.assigneeId===ownerId?'من':<bdi>{row.assigneeId}</bdi>}{row.assigneeId&&!row.assigneeActive?'؛ دسترسی مدیریتی مسئول غیرفعال است.':''}</p>:<p>مسئول پیگیری در دسترس نیست.</p>}
    {!row.saleEnabled&&<p>محصول پیش‌نویس، ناموجود یا در دسترس نیست؛ هشدار عددی به معنی مجازبودن فروش نیست.</p>}
    {!row.entityExists?<><p>برای حفظ سابقه، تنظیم حذف نشده است؛ بررسی مدیریتی لازم است.</p><p className="text-xs break-all">شناسهٔ محصول: {row.productId}؛ شناسهٔ تنوع: {row.variantId}</p></>:<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setSelected({row,action:'policy'})}>بررسی حد هشدار</Button><Button variant="outline" onClick={()=>setSelected({row,action:'adjust'})}>اصلاح موجودی این هشدار</Button><Button variant="outline" onClick={()=>setSelected({row,action:'balance'})}>بررسی رزرو این هشدار</Button></div>}
    <Button variant="outline" onClick={()=>setSelected({row,action:'followup'})}>پیگیری و سابقه</Button><Button variant="outline" onClick={()=>setSelected({row,action:'assignment'})}>مسئول پیگیری</Button>
   </li>)}</ul>}
  </>:null}
  <nav aria-label="صفحه‌بندی هشدارها" className="flex flex-wrap gap-3 items-center"><Button variant="outline" disabled={read.loading||cursors.length===1} onClick={()=>setCursors(previous=>previous.slice(0,-1))}>صفحهٔ قبلی هشدارها</Button><span>صفحهٔ هشدار {cursors.length}</span><Button variant="outline" disabled={read.loading||!!read.error||!read.value?.nextCursor} onClick={()=>{const next=read.value?.nextCursor;if(next)setCursors(previous=>[...previous,next]);}}>صفحهٔ بعدی هشدارها</Button></nav>
  {selected?.action==='assignment'&&<InventoryAssignmentDialog key={selected.row.variantId} ownerId={ownerId} row={selected.row} close={()=>{setSelected(undefined);read.retry();}}/>}
  {selected?.action==='followup'&&<InventoryFollowupDialog key={selected.row.variantId} ownerId={ownerId} row={selected.row} close={()=>{setSelected(undefined);read.retry();}}/>}
  {selected?.action==='policy'&&<InventoryPolicyDialog key={selected.row.variantId} ownerId={ownerId} row={selected.row} close={()=>{setSelected(undefined);read.retry();}}/>}
  {selected?.action==='adjust'&&<InventoryAdjustmentControls key={selected.row.variantId} ownerId={ownerId} row={selected.row} close={()=>setSelected(undefined)} refresh={refreshAfterChange}/>}
  {selected?.action==='balance'&&<InventoryBalanceDialog key={selected.row.variantId} ownerId={ownerId} row={selected.row} close={()=>setSelected(undefined)}/>}
 </section>;
}
