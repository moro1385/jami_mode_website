import { useRequestScope } from '@/shared/presentation/useRequestScope';
import {useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuthStore} from '@/stores/authStore';
import {formatRial,validWalletId,walletRequest,walletSummary,type WalletSummary} from '../wallet';
import type { CheckoutSelection } from '../domain/wallet';
export function useWalletCheckout(selection: CheckoutSelection){
 const userId=useAuthStore(s=>s.user?.id),navigate=useNavigate();
 const [summary,setSummary]=useState<WalletSummary|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [quote,setQuote]=useState<{hash:string;total:number;shipping:number;selection:string}|null>(null);const lock=useRef(false);
 const serialized=JSON.stringify(selection),confirmed=quote?.selection===serialized?quote:null;
 const captureScope=useRequestScope(JSON.stringify([userId,serialized]));
 async function inspect(){if(!userId||lock.current)return;const isCurrent=captureScope();if(!isCurrent())return;lock.current=true;setBusy(true);setSummary(null);setQuote(null);setMessage('');try{const data=await walletSummary(userId);if(isCurrent())setSummary(data);}catch{if(isCurrent())setMessage('وضعیت کیف پول قابل دریافت نیست.');}finally{if(isCurrent()){lock.current=false;setBusy(false);}}}
 async function pay(){
  if(!userId||lock.current||!summary?.spendingEnabled)return;const isCurrent=captureScope();if(!isCurrent())return;lock.current=true;setBusy(true);setMessage('');
  const storageKey='trusted-checkout:'+userId;
  try{
   const raw=sessionStorage.getItem(storageKey),saved=raw?JSON.parse(raw):null;
   const operation=saved?.selection===serialized&&validWalletId(saved.key)?saved:{selection:serialized,key:crypto.randomUUID()};
   sessionStorage.setItem(storageKey,JSON.stringify(operation));
   const result=await walletRequest(confirmed?'/api/wallet/checkout':'/api/wallet/checkout/quote',userId,{idempotencyKey:operation.key,selection,...(confirmed?{quote:confirmed.hash}:{})});
   if(!isCurrent())return;
   if(!confirmed){if(typeof result.quote!=='string'||!result.quote||!Number.isSafeInteger(result.total)||result.total<=0||!Number.isSafeInteger(result.shipping)||result.shipping<0)throw Error('Invalid quote');setQuote({hash:result.quote,total:result.total,shipping:result.shipping,selection:serialized});return;}
   if(result.success!==true||!validWalletId(result.orderId))throw Error('Missing receipt');
   sessionStorage.setItem(storageKey,JSON.stringify({...operation,orderId:result.orderId}));
   // The existing success screen independently checks the owned debit receipt.
   navigate('/checkout/success?order='+encodeURIComponent(result.orderId));
  }catch(failure){if(!isCurrent())return;setQuote(null);const code=(failure as {code?:string}).code;
   if(code==='CHECKOUT_EXPIRED'){sessionStorage.removeItem(storageKey);setMessage('مهلت سفارش تمام شده است. مبلغ جدید را دوباره بررسی کنید.');}
   else if(code==='PENDING_ORDER_LIMIT')setMessage('ابتدا سفارش‌های پرداخت‌نشده را در بخش سفارش‌های من پیگیری کنید.');
   else setMessage('پرداخت تأیید نشد. سبد خرید حفظ شده است؛ پیش از پرداخت دوباره وضعیت سفارش را بررسی کنید.');
  }finally{if(isCurrent()){lock.current=false;setBusy(false);}}
 }
 return { summary, busy, message, confirmed, inspect, pay };
}
