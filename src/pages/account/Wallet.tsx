import { useAuthStore } from '@/stores/authStore';
import { useSearchParams } from 'react-router-dom';
import AccountLayout from '@/components/account/AccountLayout';
import { formatRial, validWalletId } from '@/features/payments/wallet';
import { useWallet } from '@/features/payments/presentation/useWallet';

export default function Wallet() {
  const ownerId=useAuthStore(state=>state.user?.id); const [params]=useSearchParams();
  return <WalletContent key={JSON.stringify([ownerId,params.get('topupId'),params.get('topup')])} />;
}

function WalletContent() {
 const { summary, amount, setAmount, loading, busy, error, message, operation, storageBlocked, returnId, returnNotice, refresh, check, start } = useWallet();
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
