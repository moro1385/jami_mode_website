import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AccountLayout from '@/components/account/AccountLayout';
import { useAuthStore } from '@/stores/authStore';
import { formatRial, parseTopupAmount, readWalletOperation, safeTopupRedirect, validWalletId, walletRequest, walletSummary, type WalletSummary } from '@/lib/walletClient';

export default function Wallet(){
 const userId=useAuthStore(s=>s.user?.id);const [params]=useSearchParams();
 const [summary,setSummary]=useState<WalletSummary|null>(null),[amount,setAmount]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [operation,setOperation]=useState<ReturnType<typeof readWalletOperation>>(null),[storageBlocked,setStorageBlocked]=useState(false);
 const owner=useRef(userId);owner.current=userId;const lock=useRef(false);
 const storageKey='trusted-wallet-topup:'+userId;
 const returnId=params.get('topupId');
 useEffect(()=>{
  setSummary(null);setError('');setMessage('');setOperation(null);setLoading(true);setStorageBlocked(false);
  try{setOperation(readWalletOperation(storageKey));}catch{setStorageBlocked(true);setError('اطلاعات درخواست قبلی قابل بازیابی نیست. پیش از شارژ دوباره، فعالیت کیف پول را بررسی کنید.');}
  if(!userId){setLoading(false);return;}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);let active=true;
  async function load(){
   try{const data=await walletSummary(userId!,undefined,controller.signal);if(!active||owner.current!==userId)return;setSummary(data);
    if(validWalletId(returnId)){
     const receipt=await walletRequest('/api/bitpay/wallet-topups/'+returnId+'/status',userId!,undefined,controller.signal);
     if(!active||owner.current!==userId)return;if(receipt.topupId!==returnId||typeof receipt.paid!=='boolean')throw Error('Invalid receipt');
     setMessage(receipt.paid?'شارژ کیف پول با رسید معتبر تأیید شد.':'این شارژ هنوز تأیید نشده است. اگر وجه کسر شده، پیش از شارژ دوباره با پشتیبانی پیگیری کنید.');
     if(receipt.paid){const saved=readWalletOperation(storageKey);if(saved?.topupId===returnId){sessionStorage.removeItem(storageKey);setOperation(null);setAmount('');}}
    }
   }catch{if(active)setError('دریافت وضعیت یا رسید کیف پول ممکن نیست. دوباره بررسی کنید.');}finally{clearTimeout(timer);if(active)setLoading(false);}
  }
  void load();
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[userId,storageKey,returnId]);
 const refresh=async(more=false)=>{
  if(!userId||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const data=await walletSummary(userId,more?summary?.entries[summary.entries.length-1]:undefined);if(owner.current!==userId)return;
   setSummary(previous=>more&&previous?{...data,entries:[...previous.entries,...data.entries.filter(e=>!previous.entries.some(p=>p.id===e.id))]}:data);
  }catch{if(owner.current===userId)setError('دریافت وضعیت کیف پول ممکن نیست. دوباره بررسی کنید.');}finally{lock.current=false;setBusy(false);}
 };
 const check=async(id:string)=>{
  if(!userId||lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{const result=await walletRequest('/api/bitpay/wallet-topups/'+encodeURIComponent(id)+'/status',userId);if(owner.current!==userId)return;
   if(result.topupId!==id||typeof result.paid!=='boolean')throw Error('Invalid receipt');
   if(result.paid){setMessage('شارژ کیف پول با رسید معتبر تأیید شد.');
    const saved=readWalletOperation(storageKey);if(saved?.topupId===id){sessionStorage.removeItem(storageKey);setOperation(null);setAmount('');}
   }else setMessage('این شارژ هنوز تأیید نشده است. اگر وجه کسر شده، پیش از شارژ دوباره با پشتیبانی پیگیری کنید.');
   const data=await walletSummary(userId);if(owner.current===userId)setSummary(data);
  }catch{if(owner.current===userId)setError('وضعیت شارژ قابل بررسی نیست. این خطا به معنی لغو یا بازگشت وجه نیست.');}finally{lock.current=false;setBusy(false);}
 };
 // Query parameters only select a receipt to check; they never prove payment.
 const returnNotice=params.has('topup');
 const start=async()=>{
  if(!userId||lock.current||storageBlocked||!summary?.topupsEnabled)return;
  const value=operation?.amount??parseTopupAmount(amount);if(value===null){setError('مبلغ را به ریال، بدون اعشار و بین ۵٬۰۰۰ تا ۹۹٬۹۹۹٬۹۹۹ وارد کنید.');return;}
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const current=readWalletOperation(storageKey)??{key:crypto.randomUUID(),amount:value};
   sessionStorage.setItem(storageKey,JSON.stringify(current));setOperation(current);
   const result=await walletRequest('/api/bitpay/wallet-init',userId,{idempotencyKey:current.key,amount:current.amount});
   if(owner.current!==userId)return;if(!validWalletId(result.topupId))throw Error('Invalid topup');
   const saved={...current,topupId:result.topupId};sessionStorage.setItem(storageKey,JSON.stringify(saved));setOperation(saved);
   if(result.paid===true){setMessage('درخواست قبلی پرداخت شده است؛ رسید آن را بررسی کنید.');return;}
   window.location.assign(safeTopupRedirect(result.redirectUrl));
  }catch(failure){if(owner.current!==userId)return;
   if((failure as {code?:string}).code==='TOPUP_REJECTED'){
    try{const saved=readWalletOperation(storageKey);if(saved&&!saved.topupId){sessionStorage.removeItem(storageKey);setOperation(null);}}catch{setStorageBlocked(true);}
    setError('درخواست تازه ثبت نشد. مبلغ، ظرفیت موجودی یا شارژهای در انتظار را بررسی کنید.');return;
   }
   const id=(failure as {topupId?:string}).topupId;
   if(validWalletId(id)){try{const saved=readWalletOperation(storageKey);if(saved){const next={...saved,topupId:id};sessionStorage.setItem(storageKey,JSON.stringify(next));setOperation(next);}}catch{setStorageBlocked(true);}}
   setError('درخواست شارژ تکمیل نشد. برای جلوگیری از پرداخت دوباره، درخواست قبلی را پیگیری کنید.');
  }finally{lock.current=false;setBusy(false);}
 };
 return <AccountLayout title="کیف پول" description="موجودی و فعالیت کیف پول شما">
  <div className="bg-primary text-primary-foreground p-8 rounded-2xl">
   <p>موجودی ثبت‌شده</p><p className="mt-4 text-3xl">{summary?formatRial(summary.balance):'—'}</p>
   <p className="mt-4 text-sm">{summary?.spendingEnabled?'پرداخت از کیف پول برای این حساب در دسترس است.':'پرداخت از کیف پول فعلاً غیرفعال است؛ موجودی نمایش‌داده‌شده مجوز پرداخت نیست.'}</p>
  </div>
  {loading&&<p role="status" className="mt-6">در حال دریافت وضعیت کیف پول…</p>}
  {error&&<p role="alert" className="mt-6">{error}</p>}{message&&<p role="status" className="mt-6">{message}</p>}
  <button disabled={busy||loading} onClick={()=>void refresh()} className="mt-6 underline">بررسی دوباره کیف پول</button>
  {returnNotice&&<div className="mt-6 border p-5 rounded-xl"><p>نتیجه بازگشت از درگاه به‌تنهایی تأیید شارژ نیست.</p>{validWalletId(returnId)&&<button disabled={busy} onClick={()=>void check(returnId)} className="mt-3 underline">بررسی رسید شارژ</button>}</div>}
  <section className="mt-8 border p-6 rounded-2xl"><h2>شارژ کیف پول</h2>
   {!summary?.topupsEnabled?<p role="status" className="mt-4">{summary?.reviewRequired?'کیف پول این حساب پیش از شارژ به بررسی پشتیبانی نیاز دارد.':'شارژ جدید کیف پول موقتاً غیرفعال است.'}</p>:
    <form className="mt-4 space-y-4" onSubmit={e=>{e.preventDefault();void start();}}>
     <label className="block" htmlFor="topup-amount">مبلغ شارژ (ریال)</label>
     <input id="topup-amount" inputMode="numeric" autoComplete="off" value={operation?String(operation.amount):amount} onChange={e=>setAmount(e.target.value)} disabled={busy||!!operation||storageBlocked} className="border border-primary/40 bg-card text-foreground rounded-xl p-3 w-full focus:outline-none focus:ring-2 focus:ring-accent" aria-describedby="topup-help"/>
     <p id="topup-help" className="text-sm">۵٬۰۰۰ تا ۹۹٬۹۹۹٬۹۹۹ ریال. مبلغ واردشده ریال است.</p>
     {operation?.topupId?<button type="button" disabled={busy} onClick={()=>void check(operation.topupId!)}>پیگیری درخواست قبلی</button>:
      <button disabled={busy||storageBlocked} className="bg-accent text-accent-foreground px-6 py-3 rounded-full">{busy?'در حال بررسی…':operation?'پیگیری درخواست قبلی':'ادامه و پرداخت شارژ'}</button>}
    </form>}
   {!summary?.topupsEnabled&&operation?.topupId&&<button disabled={busy} onClick={()=>void check(operation.topupId!)} className="mt-4 underline">پیگیری درخواست قبلی</button>}
  </section>
  {!!summary?.pendingTopups.length&&<section className="mt-8"><h2>شارژهای در انتظار بررسی</h2><p className="text-sm mt-2">پرداخت‌نشده یا تأییدنشده؛ این موارد موجودی قطعی نیستند.</p><ul>{summary.pendingTopups.map(t=><li key={t.id} className="border rounded-xl p-4 mt-3 flex justify-between gap-4"><span>{formatRial(t.amount)}</span><button disabled={busy} onClick={()=>void check(t.id)}>بررسی وضعیت شارژ</button></li>)}</ul></section>}
  <section className="mt-10"><h2>فعالیت ثبت‌شده کیف پول</h2>{summary&&!summary.entries.length?<p className="mt-4">هنوز فعالیت ثبت‌شده‌ای وجود ندارد.</p>:<ul className="mt-4 divide-y border rounded-xl">{summary?.entries.map(e=><li key={e.id} className="p-5"><div className="flex justify-between gap-4"><span>{e.kind==='topup'?'شارژ کیف پول':'پرداخت سفارش'}</span><span><bdi dir="ltr">{e.amount>0?'+':'−'}{new Intl.NumberFormat('fa-IR').format(Math.abs(e.amount))}</bdi> ریال</span></div><p className="text-sm mt-2">{new Date(e.createdAt).toLocaleDateString('fa-IR')} · مانده پس از تراکنش: {formatRial(e.balanceAfter)}</p></li>)}</ul>}
   {summary?.hasMore&&<button disabled={busy} onClick={()=>void refresh(true)} className="mt-5 underline">نمایش فعالیت‌های بیشتر</button>}
  </section>
 </AccountLayout>;
}
