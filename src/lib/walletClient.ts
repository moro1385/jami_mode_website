import { supabase } from '@/integrations/supabase/client';
export type WalletEntry = { id:string; kind:'topup'|'purchase'; amount:number; balanceAfter:number; createdAt:string; orderId:string|null; topupId:string|null };
export type WalletSummary = { balance:number; currency:'IRR'; spendingEnabled:boolean; topupsEnabled:boolean; entries:WalletEntry[]; hasMore:boolean; reviewRequired?:boolean; pendingTopups:{id:string;amount:number;createdAt:string}[] };
export const validWalletId = (id:unknown): id is string => typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const formatRial = (value:number) => new Intl.NumberFormat('fa-IR').format(value)+' ریال';
export class WalletRequestError extends Error { constructor(public code:string){super('Wallet request unavailable');} }
export async function walletRequest(path:string,userId:string,body?:object,signal?:AbortSignal){
 const {data,error}=await supabase.auth.getSession();
 if(error||!data.session||data.session.user.id!==userId)throw new WalletRequestError('AUTH_REQUIRED');
 const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:signal??AbortSignal.timeout(15000)});
 const result=await response.json();
 if(!response.ok)throw Object.assign(new WalletRequestError(typeof result.code==='string'?result.code:'UNAVAILABLE'),{topupId:validWalletId(result.topupId)?result.topupId:undefined});
 return result;
}
export async function walletSummary(userId:string,cursor?:WalletEntry,signal?:AbortSignal):Promise<WalletSummary>{
 const query=cursor?'?'+new URLSearchParams({before:cursor.createdAt,beforeId:cursor.id}):'';
 const data=await walletRequest('/api/wallet/summary'+query,userId,undefined,signal);
 if(!Number.isSafeInteger(data.balance)||data.balance<0||data.currency!=='IRR'||typeof data.topupsEnabled!=='boolean'||typeof data.spendingEnabled!=='boolean'||typeof data.hasMore!=='boolean'
  ||!Array.isArray(data.entries)||data.entries.length>50||!data.entries.every((e:WalletEntry)=>validWalletId(e.id)&&['topup','purchase'].includes(e.kind)&&Number.isSafeInteger(e.amount)&&e.amount!==0&&Number.isSafeInteger(e.balanceAfter)&&e.balanceAfter>=0&&Number.isFinite(Date.parse(e.createdAt)))
  ||!Array.isArray(data.pendingTopups)||data.pendingTopups.length>5||!data.pendingTopups.every((t:{id:string;amount:number;createdAt:string})=>validWalletId(t.id)&&Number.isSafeInteger(t.amount)&&t.amount>0&&Number.isFinite(Date.parse(t.createdAt))))throw new WalletRequestError('INVALID_RESPONSE');
 return data;
}
export function parseTopupAmount(text:string):number|null{
 const normalized=text.trim().replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
 if(!/^[1-9][0-9]*$/.test(normalized))return null;
 const amount=Number(normalized);return Number.isSafeInteger(amount)&&amount>=5000&&amount<=99999999?amount:null;
}
export function readWalletOperation(storageKey:string):{key:string;amount:number;topupId?:string}|null{
 const raw=sessionStorage.getItem(storageKey);if(!raw)return null;
 const item=JSON.parse(raw);
 if(!validWalletId(item.key)||!Number.isSafeInteger(item.amount)||parseTopupAmount(String(item.amount))!==item.amount||(item.topupId!=null&&!validWalletId(item.topupId)))throw new WalletRequestError('INVALID_SAVED_REQUEST');
 return item;
}
export function safeTopupRedirect(value:unknown):string{
 if(typeof value!=='string'||!/^https:\/\/bitpay\.ir\/payment\/gateway-[1-9][0-9]{0,255}-get$/.test(value))throw new WalletRequestError('INVALID_REDIRECT');return value;
}
