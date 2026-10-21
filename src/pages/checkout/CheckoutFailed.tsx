import { Link, useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";

export default function CheckoutFailed() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order");
  const reason = searchParams.get("reason");
  const unresolved = reason !== 'cancelled';

  const getReasonMessage = (reason: string | null) => {
    switch (reason) {
      case "cancelled":
        return "بازگشت از درگاه لغو شد. اگر وجهی کسر شده، وضعیت سفارش را پیگیری کنید.";
      case "verification_failed":
      case "invalid":
        return "تأیید پرداخت با مشکل مواجه شد";
      default:
        return "مشکلی در فرآیند پرداخت رخ داد";
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-24 min-h-[60vh] flex flex-col items-center justify-center text-center">
      <XCircle className="w-20 h-20 text-destructive mb-6" />

      <h1 className="text-3xl font-medium text-foreground mb-4">
        {unresolved ? 'وضعیت پرداخت هنوز مشخص نیست' : 'پرداخت ناموفق بود یا لغو شد'}
      </h1>

      <p className="text-muted-foreground mb-8 text-lg">
        {unresolved ? 'اگر وجه کسر شده، دوباره پرداخت نکنید. وضعیت سفارش را بررسی کنید یا با پشتیبانی تماس بگیرید.' : getReasonMessage(reason)}
      </p>

      {orderId && (
        <p className="text-sm text-muted-foreground mb-8">
          شماره سفارش معلق: <span className="font-mono bg-muted px-2 py-1 rounded-sm text-foreground">{orderId}</span>
        </p>
      )}

      <Link
        to={unresolved ? '/account/orders' : '/checkout/payment'}
        className="h-12 px-8 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center rounded-full"
      >
        {unresolved ? 'پیگیری سفارشات من' : 'بازگشت و تلاش مجدد'}
      </Link>
    </div>
  );
}
