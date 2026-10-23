import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, CircleAlert } from 'lucide-react';
import { validOrderId } from '@/features/payments/domain/receipt';
import { useCheckoutReceipt } from '@/features/payments/presentation/useCheckoutReceipt';
export default function CheckoutSuccess() {
  const { state, orderId, retry } = useCheckoutReceipt();
  return (
    <div className="max-w-4xl mx-auto px-6 py-24 min-h-[60vh] flex flex-col items-center justify-center text-center">
      {state === 'loading' ? <Loader2 className="w-20 h-20 animate-spin mb-6" /> : state === 'paid'
        ? <CheckCircle2 className="w-20 h-20 text-green-500 mb-6" /> : <CircleAlert className="w-20 h-20 mb-6" />}
      <h1 className="text-3xl font-medium mb-4">{state === 'paid' ? 'پرداخت با موفقیت انجام شد'
        : state === 'loading' ? 'در حال بررسی وضعیت سفارش...'
        : state === 'pending' ? 'پرداخت این سفارش هنوز تأیید نشده است' : 'وضعیت پرداخت قابل بررسی نیست'}</h1>
      {state !== 'paid' && state !== 'loading' && <p className="mb-6">سبد خرید شما حفظ شده است. اگر وجه کسر شده، پیش از پرداخت دوباره وضعیت سفارش را پیگیری کنید.</p>}
      {validOrderId(orderId) && <p className="text-muted-foreground mb-8">شماره سفارش: <span dir="ltr">{orderId}</span></p>}
      {(state === 'pending' || state === 'unavailable') && <button onClick={retry} className="mb-6">بررسی دوباره وضعیت</button>}
      <Link to="/account/orders" className="h-12 px-8 bg-foreground text-background flex items-center rounded-full">مشاهده سفارشات من</Link>
    </div>
  );
}
