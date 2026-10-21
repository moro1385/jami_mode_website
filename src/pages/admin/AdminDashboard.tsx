import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/services/products";
import { Package, ShoppingBag, Users, DollarSign, Loader2 } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    users: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [productsRes, ordersRes, usersRes] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("id, total_amount", { count: "exact" }),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
        ]);

        const ordersData = ordersRes.data || [];
        const revenue = ordersData.reduce((acc, order) => acc + (order.total_amount || 0), 0);

        setStats({
          products: productsRes.count || 0,
          orders: ordersRes.count || 0,
          users: usersRes.count || 0,
          revenue,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">داشبورد</h1>
        <p className="text-muted-foreground mt-2">
          به داشبورد مدیریت جامی مد خوش آمدید.
        </p>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border bg-card text-card-foreground shadow-xs p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="tracking-tight text-sm font-medium">کل محصولات</h3>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.products}</div>
          </div>

          <div className="rounded-2xl border bg-card text-card-foreground shadow-xs p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="tracking-tight text-sm font-medium">کل سفارشات</h3>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.orders}</div>
          </div>

          <div className="rounded-2xl border bg-card text-card-foreground shadow-xs p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="tracking-tight text-sm font-medium">کاربران فعال</h3>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.users}</div>
          </div>

          <div className="rounded-2xl border bg-card text-card-foreground shadow-xs p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="tracking-tight text-sm font-medium">درآمد کل</h3>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{formatPrice(stats.revenue)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
