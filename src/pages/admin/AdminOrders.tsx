import {AdminPageHeader,AdminStat} from '@/components/admin/AdminPrimitives';
import {adminDate} from '@/components/admin/adminFormat';
import {WorkflowActions} from '@/features/erp/presentation/WorkflowActions';
import { useAuthStore } from '@/stores/authStore';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useAdminOrders } from '@/features/orders/presentation/useAdminOrders';
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { OrderDetailsDialog } from "@/components/shared/OrderDetailsDialog";


export default function AdminOrders() {
  const ownerId = useAuthStore(state => state.user?.id);
  return <AdminOrdersContent key={ownerId ?? 'signed-out'} ownerId={ownerId} />;
}
function AdminOrdersContent({ ownerId }: { ownerId?: string }) {
  const { orders, loading: isLoading, error, retry } = useAdminOrders(ownerId);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);


  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="مدیریت فروش" title="سفارشات" description="وضعیت پرداخت، آماده‌سازی و ارسال سفارش‌ها را پیگیری کنید."/>
      <div className="admin-stats"><AdminStat label="سفارش بارگیری‌شده" value={isLoading||error?undefined:orders.length}/><AdminStat label="در انتظار پرداخت" value={isLoading||error?undefined:orders.filter(o=>o.status==='pending_payment').length}/><AdminStat label="در حال آماده‌سازی" value={isLoading||error?undefined:orders.filter(o=>o.status==='processing').length}/><AdminStat label="ارسال‌شده" value={isLoading||error?undefined:orders.filter(o=>o.status==='shipped').length}/></div>
      <OrderDetailsDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        orderId={selectedOrderId}
      />

      <div className="admin-card">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <ReadFailure retry={retry} message="بارگیری سفارشات با شکست مواجه شد" />
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            هیچ سفارشی پیدا نشد.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شناسه سفارش</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>مشتری</TableHead>
                <TableHead>ارسال / پرداخت</TableHead>
                <TableHead>مبلغ کل</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-left">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const customerName = [order.profiles?.first_name, order.profiles?.last_name].filter(Boolean).join(" ");
                const customerDisplay = customerName || order.profiles?.phone || "کاربر ناشناس";

                return (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={(e) => {
                      // Prevent row click if clicking on the select dropdown
                      if ((e.target as HTMLElement).closest('[role="combobox"]')) return;
                      setSelectedOrderId(order.id);
                      setIsDialogOpen(true);
                    }}
                  >
                    <TableCell className="font-medium font-mono text-xs">
                      {order.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {adminDate(order.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{customerDisplay}</span>
                        {customerName && order.profiles?.phone && (
                          <span className="text-xs text-muted-foreground">{order.profiles.phone}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                         <span>{order.shipping_method === 'express' ? "پست پیشتاز" : order.shipping_method === 'regular' ? "پست معمولی" : "ثبت نشده"}</span>
                         <span className="text-muted-foreground capitalize">{order.payment_method === 'wallet' ? "کیف پول" : order.payment_method === 'gateway' ? "درگاه پرداخت" : order.payment_method || "ثبت نشده"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{new Intl.NumberFormat('fa-IR').format(order.total_amount)} ریال</TableCell>
                    <TableCell>
                      {ownerId&&<WorkflowActions key={ownerId+order.id} owner={ownerId} resource="orders" row={{id:order.id,status:order.status,paymentState:order.checkout_version===2?order.payment_state:'legacy',amount:String(order.total_amount)}} refresh={retry}/>}
                      <a className="admin-order-history" href="/admin/erp?section=orders" onClick={event=>event.stopPropagation()}>سوابق و بازپرداخت</a>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" /><span>جزئیات</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
