import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { formatRial, parseTopupAmount, readWalletOperation, safeTopupRedirect, validWalletId, walletRequest, walletSummary, type WalletSummary } from '../wallet';

export function useWallet(){
 const userId=useAuthStore(s=>s.user?.id);const [params]=useSearchParams();
 const [summary,setSummary]=useState<WalletSummary|null>(null),[amount,setAmount]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [operation,setOperation]=useState<ReturnType<typeof readWalletOperation>>(null),[storageBlocked,setStorageBlocked]=useState(false);
 const captureScope=useRequestScope(userId);const lock=useRef(false);
 const storageKey='trusted-wallet-topup:'+userId;
 const returnId=params.get('topupId');
 useEffect(()=>{
  const isCurrent=captureScope();
  setSummary(null);setError('');setMessage('');setOperation(null);setLoading(true);setStorageBlocked(false);
  try{setOperation(readWalletOperation(storageKey));}catch{setStorageBlocked(true);setError('اطلاعات درخواست قبلی قابل بازیابی نیست. پیش از شارژ دوباره، فعالیت کیف پول را بررسی کنید.');}
  if(!userId){setLoading(false);return;}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);let active=true;
  async function load(){
   try{const data=await walletSummary(userId!,undefined,controller.signal);if(!active||!isCurrent())return;setSummary(data);
    if(validWalletId(returnId)){
     const receipt=await walletRequest('/api/bitpay/wallet-topups/'+returnId+'/status',userId!,undefined,controller.signal);
     if(!active||!isCurrent())return;if(receipt.topupId!==returnId||typeof receipt.paid!=='boolean')throw Error('Invalid receipt');
     setMessage(receipt.paid?'شارژ کیف پول با رسید معتبر تأیید شد.':'این شارژ هنوز تأیید نشده است. اگر وجه کسر شده، پیش از شارژ دوباره با پشتیبانی پیگیری کنید.');
     if(receipt.paid){const saved=readWalletOperation(storageKey);if(saved?.topupId===returnId){sessionStorage.removeItem(storageKey);setOperation(null);setAmount('');}}
    }
   }catch{if(active&&isCurrent())setError('دریافت وضعیت یا رسید کیف پول ممکن نیست. دوباره بررسی کنید.');}finally{clearTimeout(timer);if(active&&isCurrent())setLoading(false);}
  }
  void load();
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[userId,storageKey,returnId,captureScope]);
 const refresh=async(more=false)=>{
  if(!userId||lock.current)return;const isCurrent=captureScope();if(!isCurrent())return;lock.current=true;setBusy(true);setError('');
  try{const data=await walletSummary(userId,more?summary?.entries[summary.entries.length-1]:undefined);if(!isCurrent())return;
   setSummary(previous=>more&&previous?{...data,entries:[...previous.entries,...data.entries.filter(e=>!previous.entries.some(p=>p.id===e.id))]}:data);
  }catch{if(isCurrent())setError('دریافت وضعیت کیف پول ممکن نیست. دوباره بررسی کنید.');}finally{if(isCurrent()){lock.current=false;setBusy(false);}}
 };
 const check=async(id:string)=>{
  if(!userId||lock.current)return;const isCurrent=captureScope();if(!isCurrent())return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{const result=await walletRequest('/api/bitpay/wallet-topups/'+encodeURIComponent(id)+'/status',userId);if(!isCurrent())return;
   if(result.topupId!==id||typeof result.paid!=='boolean')throw Error('Invalid receipt');
   if(result.paid){setMessage('شارژ کیف پول با رسید معتبر تأیید شد.');
    const saved=readWalletOperation(storageKey);if(saved?.topupId===id){sessionStorage.removeItem(storageKey);setOperation(null);setAmount('');}
   }else setMessage('این شارژ هنوز تأیید نشده است. اگر وجه کسر شده، پیش از شارژ دوباره با پشتیبانی پیگیری کنید.');
   const data=await walletSummary(userId);if(isCurrent())setSummary(data);
  }catch{if(isCurrent())setError('وضعیت شارژ قابل بررسی نیست. این خطا به معنی لغو یا بازگشت وجه نیست.');}finally{if(isCurrent()){lock.current=false;setBusy(false);}}
 };
 // Query parameters only select a receipt to check; they never prove payment.
 const returnNotice=params.has('topup');
 const start=async()=>{
  if(!userId||lock.current||storageBlocked||!summary?.topupsEnabled)return;
  const value=operation?.amount??parseTopupAmount(amount);if(value===null){setError('مبلغ را به ریال، بدون اعشار و بین ۵٬۰۰۰ تا ۹۹٬۹۹۹٬۹۹۹ وارد کنید.');return;}
  const isCurrent=captureScope();if(!isCurrent())return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const current=readWalletOperation(storageKey)??{key:crypto.randomUUID(),amount:value};
   sessionStorage.setItem(storageKey,JSON.stringify(current));setOperation(current);
   const result=await walletRequest('/api/bitpay/wallet-init',userId,{idempotencyKey:current.key,amount:current.amount});
   if(!isCurrent())return;if(!validWalletId(result.topupId))throw Error('Invalid topup');
   const saved={...current,topupId:result.topupId};sessionStorage.setItem(storageKey,JSON.stringify(saved));setOperation(saved);
   if(result.paid===true){setMessage('درخواست قبلی پرداخت شده است؛ رسید آن را بررسی کنید.');return;}
   window.location.assign(safeTopupRedirect(result.redirectUrl));
  }catch(failure){if(!isCurrent())return;
   if((failure as {code?:string}).code==='TOPUP_REJECTED'){
    try{const saved=readWalletOperation(storageKey);if(saved&&!saved.topupId){sessionStorage.removeItem(storageKey);setOperation(null);}}catch{setStorageBlocked(true);}
    setError('درخواست تازه ثبت نشد. مبلغ، ظرفیت موجودی یا شارژهای در انتظار را بررسی کنید.');return;
   }
   const id=(failure as {topupId?:string}).topupId;
   if(validWalletId(id)){try{const saved=readWalletOperation(storageKey);if(saved){const next={...saved,topupId:id};sessionStorage.setItem(storageKey,JSON.stringify(next));setOperation(next);}}catch{setStorageBlocked(true);}}
   setError('درخواست شارژ تکمیل نشد. برای جلوگیری از پرداخت دوباره، درخواست قبلی را پیگیری کنید.');
  }finally{if(isCurrent()){lock.current=false;setBusy(false);}}
 };
 return { summary, amount, setAmount, loading, busy, error, message, operation, storageBlocked, returnId, returnNotice, refresh, check, start };
}
