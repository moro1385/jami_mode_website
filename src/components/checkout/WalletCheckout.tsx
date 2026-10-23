import { useAuthStore } from '@/stores/authStore';
import { formatRial, type CheckoutSelection } from '@/features/payments/wallet';
import { useWalletCheckout } from '@/features/payments/presentation/useWalletCheckout';

export default function WalletCheckout({selection}:{selection:CheckoutSelection}){
 const ownerId=useAuthStore(state=>state.user?.id);
 return <WalletCheckoutContent key={JSON.stringify([ownerId,selection])} selection={selection} />;
}
function WalletCheckoutContent({selection}:{selection:CheckoutSelection}){
 const { summary, busy, message, confirmed, inspect, pay } = useWalletCheckout(selection);
 return <div className="border border-border bg-muted/30 p-6 rounded-2xl"><h3 className="font-medium">پرداخت از کیف پول</h3>
  <p className="mt-3 text-sm">موجودی ثبت‌شده: {summary?formatRial(summary.balance):'پس از بررسی نمایش داده می‌شود'}</p>
  <button disabled={busy} onClick={()=>void inspect()} className="mt-4 underline text-sm">بررسی موجودی و امکان پرداخت</button>
  {!summary?.spendingEnabled&&<p role="status" className="mt-4 text-sm">پرداخت از کیف پول موقتاً در دسترس نیست.</p>}
  {confirmed&&<p role="status" className="mt-4">مبلغ نهایی سرور: {formatRial(confirmed.total)}؛ شامل ارسال {formatRial(confirmed.shipping)}. برای پرداخت این مبلغ تأیید کنید.</p>}
  {message&&<p role="alert" className="mt-4">{message}</p>}
  <button disabled={busy||!summary?.spendingEnabled} onClick={()=>void pay()} className="w-full mt-5 h-12 bg-primary text-primary-foreground rounded-full disabled:opacity-50">{busy?'در حال بررسی…':confirmed?'تأیید مبلغ و پرداخت از کیف پول':'بررسی مبلغ پرداخت از کیف پول'}</button>
 </div>;
}
