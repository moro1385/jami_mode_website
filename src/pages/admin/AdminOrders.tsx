import { fulfillmentOptions } from "@/lib/orderFulfillment";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { OrderDetailsDialog } from "@/components/shared/OrderDetailsDialog";

type Order = {
  id: string;
  created_at: string;
  status: string;
  total_amount: number;
  shipping_cost: number;
  shipping_method: string | null;
  payment_method: string | null;
  user_id: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          created_at,
          status,
          total_amount,
          shipping_cost,
          shipping_method,
          payment_method,
          user_id,
          profiles (
            first_name,
            last_name,
            phone
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      // The type from supabase join is slightly annoying, so we cast it for now
      setOrders(data as unknown as Order[]);
    } catch (err: unknown) {
      console.error("Error fetching orders:", err);
      setError((err instanceof Error ? err.message : "An error occurred") || "بارگیری سفارشات با شکست مواجه شد");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateOrderStatus(id: string, newStatus: string) {
    const order = orders.find(o => o.id === id);
    if (!order || !fulfillmentOptions(order.status).includes(newStatus) || newStatus === order.status) return;
    try {
      // Optimistic update
      setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));

      const { data, error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", id)
        .eq("status", order.status)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) throw new Error("Order status was not saved");
      toast.success(`وضعیت سفارش به‌روز شد به ${newStatus}`);
    } catch (err: unknown) {
      console.error("Error updating status:", err);
      toast.error((err instanceof Error ? err.message : "An error occurred") || "به‌روزرسانی وضعیت با شکست مواجه شد");
      // Revert on error
      fetchOrders();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">سفارشات</h1>
        <p className="text-muted-foreground mt-2">
          سفارشات مشتریان را در اینجا مدیریت کنید.
        </p>
      </div>

      <OrderDetailsDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        orderId={selectedOrderId}
      />

      <div className="bg-background rounded-2xl border">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">
            {error}
          </div>
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
                      {format(new Date(order.created_at), "MMM d, yyyy")}
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
                         <span>{order.shipping_method === 'express' ? "پست پیشتاز" : order.shipping_method === 'regular' ? "پست معمولی" : "N/A"}</span>
                         <span className="text-muted-foreground capitalize">{order.payment_method === 'wallet' ? "کیف پول" : order.payment_method === 'gateway' ? "درگاه پرداخت" : order.payment_method || "N/A"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{new Intl.NumberFormat('fa-IR').format(order.total_amount)} ریال</TableCell>
                    <TableCell>
                      <Select
                        value={order.status}
                        disabled={fulfillmentOptions(order.status).length === 1}
                        onValueChange={(value) => updateOrderStatus(order.id, value)}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs">
                          <SelectValue placeholder="وضعیت" />
                        </SelectTrigger>
                        <SelectContent>
                          {fulfillmentOptions(order.status).map(status => (
                            <SelectItem key={status} value={status}>{({
                              pending_payment: "در انتظار پرداخت", payment_failed: "پرداخت ناموفق",
                              pending: "در انتظار", confirmed: "تایید شده", processing: "در حال پردازش",
                              shipped: "ارسال شده", delivered: "تحویل داده شده", cancelled: "لغو شده",
                            } as Record<string, string>)[status] || status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
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
