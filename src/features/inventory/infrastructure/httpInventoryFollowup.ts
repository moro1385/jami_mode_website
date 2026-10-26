import {adjustmentUuid} from '../domain/adjustments';
import {parseFollowup,parseFollowupReceipt,parseFollowupHistory,type FollowupTarget,type FollowupCursor} from '../domain/followup';
type Client={auth:{getSession():Promise<{data:{session:{user:{id:string};access_token:string}|null};error:unknown}>}};
export class FollowupError extends Error{constructor(public code:string){super(code);}}
export function createInventoryFollowup(client:Client,send:typeof fetch){
 async function request(owner:string,product:string,variant:string,current:()=>boolean,target?:FollowupTarget,history=false,cursor:FollowupCursor|null=null){
  if(!current()||![owner,product,variant].every(adjustmentUuid))throw Error('حساب یا انتخاب تغییر کرده است.');
  const {data,error}=await client.auth.getSession();if(error||data.session?.user.id!==owner||!data.session.access_token||!current())throw Error('نشست معتبر نیست.');
  const query=new URLSearchParams({productId:product,variantId:variant,...(cursor??{})});
  const path='/api/admin/inventory/followup'+(history?'/history':'')+(target?'':'?'+query);
  const response=await send(path,{method:target?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(target?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(15000),...(target?{body:JSON.stringify(target)}:{})});
  const value=await response.json();if(!current())throw Error('حساب یا انتخاب تغییر کرده است.');if(!response.ok)throw new FollowupError(typeof value?.code==='string'?value.code:'FOLLOWUP_RESULT_UNCONFIRMED');return value;
 }
 return{
  async read(owner:string,product:string,variant:string,current:()=>boolean){return parseFollowup(await request(owner,product,variant,current),product,variant);},
  async save(owner:string,target:FollowupTarget,current:()=>boolean){return parseFollowupReceipt(await request(owner,target.productId,target.variantId,current,target),owner,target);},
  async history(owner:string,product:string,variant:string,cursor:FollowupCursor|null,current:()=>boolean){return parseFollowupHistory(await request(owner,product,variant,current,undefined,true,cursor),product,variant,cursor);},
 };
}
