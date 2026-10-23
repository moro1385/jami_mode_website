import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useState } from "react";
import { Link } from "react-router-dom";
import { Package, Loader2 } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuthStore } from "@/stores/authStore";
import { useAccountOrders } from "@/features/orders/presentation/useAccountOrders";
import { cn } from "@/lib/utils";
import { OrderDetailsDialog } from "@/components/shared/OrderDetailsDialog";

const statusStyles: Record<string, string> = {
  processing: "bg-muted text-muted-foreground",
  confirmed: "bg-secondary text-secondary-foreground",
  shipped: "bg-accent text-accent-foreground",
  delivered: "bg-primary text-primary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

const statusTranslations: Record<string, string> = {
  pending: "در انتظار",
  processing: "در حال پردازش",
  confirmed: "تایید شده",
  shipped: "ارسال شده",
  delivered: "تحویل داده شده",
  cancelled: "لغو شده",
  pending_payment: "ناموفق",
  payment_failed: "ناموفق",
};

export default function Orders() {
  const user = useAuthStore((s) => s.user);
  const { orders, loading, error, retry } = useAccountOrders(user?.id);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (loading) {
    return (
      <AccountLayout title="سفارشات" description="هر سفارش را از تأیید تا تحویل پیگیری کنید.">
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout title="سفارشات" description="هر سفارش را از تأیید تا تحویل پیگیری کنید.">
      <OrderDetailsDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        orderId={selectedOrderId}
      />
        {error ? <ReadFailure retry={retry} /> : orders.length === 0 ? (
          <div className="text-center py-14">
            <Package className="w-8 h-8 mx-auto text-muted-foreground" strokeWidth={1.25} />
            <p className="mt-6 text-lg font-light text-foreground">هنوز سفارشی وجود ندارد</p>
            <p className="mt-2 text-sm text-muted-foreground">
              هنگامی که اولین سفارش خود را ثبت کنید، در اینجا با به‌روزرسانی‌های زنده تحویل ظاهر می‌شود.
            </p>
            <Link
              to="/shop"
              className="mt-8 inline-flex h-12 items-center px-8 bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
            >
              شروع خرید
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => (
              <article
                key={order.id}
                className="border border-border cursor-pointer hover:bg-muted/10 transition-colors rounded-2xl overflow-hidden"
                onClick={() => {
                  setSelectedOrderId(order.id);
                  setIsDialogOpen(true);
                }}
              >
                <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-border">
                  <div>
                    <p className="text-sm text-foreground">
                      سفارش {order.number}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      {" • "}
                      {order.deliveryStatus}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={cn(
                        "text-[10px] px-3 py-1.5 rounded-full",
                        statusStyles[order.status] || statusStyles.processing
                      )}
                    >
                      {statusTranslations[order.status.toLowerCase()] || order.status}
                    </span>
                    <p className="text-sm text-foreground tabular-nums">
                      {new Intl.NumberFormat('fa-IR').format(order.total)} ریال
                    </p>
                  </div>
                </header>
                <ul className="flex flex-col gap-2 p-4">
                  {order.lines.map((line, i) => (
                    <li key={i} className="flex items-center justify-between gap-4 px-4 py-3 border border-border rounded-xl">
                      <div>
                        <p className="text-sm text-foreground">{line.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.variant} • تعداد {line.quantity}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {new Intl.NumberFormat('fa-IR').format(line.price)} ریال
                      </p>
                    </li>
                  ))}
                </ul>
              </article>
          ))}
        </div>
      )}
    </AccountLayout>
  );
}
