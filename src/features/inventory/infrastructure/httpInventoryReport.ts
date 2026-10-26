import {adjustmentUuid} from '../domain/adjustments';
import {parseInventoryBalance} from '../domain/balance';
type Client={auth:{getSession():Promise<{data:{session:{user:{id:string};access_token:string}|null};error:unknown}>}};
export function createInventoryReport(client:Client,send:typeof fetch){return{async read(owner:string,product:string,variant:string,current:()=>boolean){
 if(!current()||![owner,product,variant].every(adjustmentUuid))throw Error('انتخاب حساب یا تنوع معتبر نیست.');
 const {data,error}=await client.auth.getSession();if(error||data.session?.user.id!==owner||!data.session.access_token||!current())throw Error('نشست معتبر نیست.');
 const query=new URLSearchParams({productId:product,variantId:variant});
 const response=await send('/api/admin/inventory/balance?'+query,{headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store',signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok){if(value?.code==='INVENTORY_REPORTS_DISABLED')throw Error('گزارش تفکیک موجودی هنوز فعال نشده است.');throw Error('خواندن گزارش موجودی انجام نشد.');}
 if(!current())throw Error('حساب یا انتخاب تغییر کرده است.');return parseInventoryBalance(value,product,variant);
}};}
