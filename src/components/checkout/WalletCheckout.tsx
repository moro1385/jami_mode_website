import {useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuthStore} from '@/stores/authStore';
import {formatRial,validWalletId,walletRequest,walletSummary,type WalletSummary} from '@/lib/walletClient';
type Selection={addressId:string;shippingOption:string;items:{productId:string;quantity:number;size?:string;color?:string}[]};
export default function WalletCheckout({selection}:{selection:Selection}){
 const userId=useAuthStore(s=>s.user?.id),navigate=useNavigate();
 const [summary,setSummary]=useState<WalletSummary|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [quote,setQuote]=useState<{hash:string;total:number;shipping:number;selection:string}|null>(null);const lock=useRef(false);
 const owner=useRef(userId);owner.current=userId;
 const serialized=JSON.stringify(selection),confirmed=quote?.selection===serialized?quote:null;
 async function inspect(){if(!userId||lock.current)return;lock.current=true;setBusy(true);setSummary(null);setQuote(null);setMessage('');try{const data=await walletSummary(userId);if(owner.current===userId)setSummary(data);}catch{setMessage('وضعیت کیف پول قابل دریافت نیست.');}finally{lock.current=false;setBusy(false);}}
 async function pay(){
  if(!userId||lock.current||!summary?.spendingEnabled)return;lock.current=true;setBusy(true);setMessage('');
  const storageKey='trusted-checkout:'+userId;
  try{
   const raw=sessionStorage.getItem(storageKey),saved=raw?JSON.parse(raw):null;
   const operation=saved?.selection===serialized&&validWalletId(saved.key)?saved:{selection:serialized,key:crypto.randomUUID()};
   sessionStorage.setItem(storageKey,JSON.stringify(operation));
   const result=await walletRequest(confirmed?'/api/wallet/checkout':'/api/wallet/checkout/quote',userId,{idempotencyKey:operation.key,selection,...(confirmed?{quote:confirmed.hash}:{})});
   if(owner.current!==userId)return;
   if(!confirmed){if(typeof result.quote!=='string'||!result.quote||!Number.isSafeInteger(result.total)||result.total<=0||!Number.isSafeInteger(result.shipping)||result.shipping<0)throw Error('Invalid quote');setQuote({hash:result.quote,total:result.total,shipping:result.shipping,selection:serialized});return;}
   if(result.success!==true||!validWalletId(result.orderId))throw Error('Missing receipt');
   sessionStorage.setItem(storageKey,JSON.stringify({...operation,orderId:result.orderId}));
   // The existing success screen independently checks the owned debit receipt.
   navigate('/checkout/success?order='+encodeURIComponent(result.orderId));
  }catch(failure){if(owner.current!==userId)return;setQuote(null);const code=(failure as {code?:string}).code;
   if(code==='CHECKOUT_EXPIRED'){sessionStorage.removeItem(storageKey);setMessage('مهلت سفارش تمام شده است. مبلغ جدید را دوباره بررسی کنید.');}
   else if(code==='PENDING_ORDER_LIMIT')setMessage('ابتدا سفارش‌های پرداخت‌نشده را در بخش سفارش‌های من پیگیری کنید.');
   else setMessage('پرداخت تأیید نشد. سبد خرید حفظ شده است؛ پیش از پرداخت دوباره وضعیت سفارش را بررسی کنید.');
  }finally{lock.current=false;setBusy(false);}
 }
 return <div className="border border-border bg-muted/30 p-6 rounded-2xl"><h3 className="font-medium">پرداخت از کیف پول</h3>
  <p className="mt-3 text-sm">موجودی ثبت‌شده: {summary?formatRial(summary.balance):'پس از بررسی نمایش داده می‌شود'}</p>
  <button disabled={busy} onClick={()=>void inspect()} className="mt-4 underline text-sm">بررسی موجودی و امکان پرداخت</button>
  {!summary?.spendingEnabled&&<p role="status" className="mt-4 text-sm">پرداخت از کیف پول موقتاً در دسترس نیست.</p>}
  {confirmed&&<p role="status" className="mt-4">مبلغ نهایی سرور: {formatRial(confirmed.total)}؛ شامل ارسال {formatRial(confirmed.shipping)}. برای پرداخت این مبلغ تأیید کنید.</p>}
  {message&&<p role="alert" className="mt-4">{message}</p>}
  <button disabled={busy||!summary?.spendingEnabled} onClick={()=>void pay()} className="w-full mt-5 h-12 bg-primary text-primary-foreground rounded-full disabled:opacity-50">{busy?'در حال بررسی…':confirmed?'تأیید مبلغ و پرداخت از کیف پول':'بررسی مبلغ پرداخت از کیف پول'}</button>
 </div>;
}
