import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useAuthStore } from "@/stores/authStore";
import { useOrderDetails } from "@/features/orders/presentation/useOrderDetails";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

export function OrderDetailsDialog({ open, onOpenChange, orderId }: OrderDetailsDialogProps) {
  const actorId = useAuthStore(state => state.user?.id);
  const { order, items, isLoading, error, retry } = useOrderDetails(open, orderId, actorId);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>جزئیات سفارش</DialogTitle>
          <DialogDescription>
            شناسه: <span className="font-mono">{orderId}</span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (<ReadFailure retry={retry} />) : !order ? (
          <div className="text-center p-8 text-muted-foreground">سفارش پیدا نشد.</div>
        ) : (
          <div className="mt-4 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">تاریخ</p>
                <p className="font-medium">{format(new Date(order.created_at), "MMM d, yyyy h:mm a")}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">وضعیت</p>
                <p className="font-medium capitalize">{statusTranslations[order.status.toLowerCase()] || order.status}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground mb-1">آدرس ارسال</p>
                <p className="font-medium">{order.shipping_address || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">روش ارسال</p>
                <p className="font-medium capitalize">
                  {order.shipping_method === 'express' ? "پست پیشتاز" : order.shipping_method === 'regular' ? "پست معمولی" : order.shipping_method || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">روش پرداخت</p>
                <p className="font-medium capitalize">{order.payment_method === 'wallet' ? "کیف پول" : order.payment_method === 'gateway' ? "درگاه پرداخت" : order.payment_method || "N/A"}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium border-b pb-2 mb-4">اقلام سفارش</h3>

              {items.length === 0 ? (
                 <p className="text-sm text-muted-foreground text-center py-4">هیچ موردی برای این سفارش پیدا نشد.</p>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start text-sm">
                      <div className="flex gap-3">
                        {item.image_url ? (
                          <img src={supabaseAssetUrl(item.image_url)} alt={item.title || "محصول"} className="w-12 h-12 object-cover rounded-sm bg-muted" loading="lazy" width={48} height={48} />
                        ) : (
                          <div className="w-12 h-12 rounded-sm bg-muted flex items-center justify-center text-xs text-muted-foreground">بدون تصویر</div>
                        )}
                        <div>
                          <p className="font-medium">{item.title || "محصول نامشخص"}</p>
                          <div className="text-muted-foreground text-xs space-x-2 space-x-reverse">
                            {item.variant_title && <span>مدل: {item.variant_title}</span>}
                          </div>
                          <p className="text-muted-foreground mt-1">تعداد: {item.quantity}</p>
                        </div>
                      </div>
                      <div className="font-medium text-left">
                        {new Intl.NumberFormat('fa-IR').format(item.price * item.quantity)} ریال
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-2 text-sm">
              <div className="flex justify-between items-center text-muted-foreground">
                 <span>جمع جزء</span>
                 <span>{new Intl.NumberFormat('fa-IR').format(order.total_amount - order.shipping_cost)} ریال</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                 <span>هزینه ارسال</span>
                 <span>{new Intl.NumberFormat('fa-IR').format(order.shipping_cost)} ریال</span>
              </div>
              <div className="flex justify-between items-center font-medium pt-2 border-t">
                 <span>مبلغ کل</span>
                 <span>{new Intl.NumberFormat('fa-IR').format(order.total_amount)} ریال</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
