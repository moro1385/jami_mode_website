import {adjustmentUuid} from '../domain/adjustments';
import {parsePolicy,parsePolicyReceipt,type PolicyTarget} from '../domain/policy';
type Client={auth:{getSession():Promise<{data:{session:{user:{id:string};access_token:string}|null};error:unknown}>}};
export class PolicyError extends Error{constructor(public code:string){super(code);}}
export function createInventoryPolicy(client:Client,send:typeof fetch){
 async function request(owner:string,product:string,variant:string,current:()=>boolean,target?:PolicyTarget){
  if(!current()||![owner,product,variant].every(adjustmentUuid))throw Error('حساب یا انتخاب تغییر کرده است.');
  const {data,error}=await client.auth.getSession();if(error||data.session?.user.id!==owner||!data.session.access_token||!current())throw Error('نشست معتبر نیست.');
  const path='/api/admin/inventory/policy'+(target?'':'?'+new URLSearchParams({productId:product,variantId:variant}));
  const response=await send(path,{method:target?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(target?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(15000),...(target?{body:JSON.stringify(target)}:{})});
  const value=await response.json();if(!response.ok)throw new PolicyError(typeof value?.code==='string'?value.code:'POLICY_RESULT_UNCONFIRMED');
  if(!current())throw Error('حساب یا انتخاب تغییر کرده است.');return value;
 }
 return{async read(owner:string,product:string,variant:string,current:()=>boolean){return parsePolicy(await request(owner,product,variant,current),product,variant);},
  async save(owner:string,target:PolicyTarget,current:()=>boolean){return parsePolicyReceipt(await request(owner,target.productId,target.variantId,current,target),owner,target);}};
}
