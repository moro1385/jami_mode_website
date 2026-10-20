import { Link } from "react-router-dom";

export default function OrderTracking() {
  return (
    <article className="max-w-3xl mx-auto px-6 pt-8 pb-32 text-right">
      {/* Headline */}
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-16 leading-tight md:leading-none">
        پیگیری سفارش
      </h1>

      {/* Content */}
      <div className="space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground mb-24 md:leading-7">
        <p>
          شما می‌توانید برای مشاهده وضعیت تمامی سفارشات خود از طریق پنل کاربری اقدام کنید.
          در صفحه سفارشات، اطلاعات دقیقی از مراحل پردازش و ارسال هر سفارش قابل مشاهده است.
        </p>

        <div className="mt-12 flex justify-start">
          <Link
            to="/account/orders"
            className="inline-flex h-12 items-center px-8 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            مشاهده سفارشات من
          </Link>
        </div>
      </div>
    </article>
  );
}
