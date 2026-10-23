import { useDashboard } from "@/features/dashboard/presentation/useDashboard";
import { formatPrice } from "@/services/products";
import { Package, ShoppingBag, Users, DollarSign, Loader2 } from "lucide-react";

export default function AdminDashboard() {
  const { stats, loading, error, retry } = useDashboard();

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
      ) : error || !stats ? (
        <div role="alert">دریافت آمار ممکن نیست. <button onClick={retry}>بررسی دوباره</button></div>
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
              <h3 className="tracking-tight text-sm font-medium">کل کاربران</h3>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.users}</div>
          </div>

          <div className="rounded-2xl border bg-card text-card-foreground shadow-xs p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="tracking-tight text-sm font-medium">مبلغ کل سفارش‌ها</h3>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{formatPrice(stats.revenue)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
