import { useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet as WalletIcon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('fa-IR').format(amount) + " ریال";

export default function Wallet() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const wallet = user?.wallet;
  const transactions = wallet?.transactions ?? [];

  useEffect(() => {
    const topupStatus = searchParams.get("topup");
    if (topupStatus === "success") {
      toast.success("کیف پول با موفقیت شارژ شد");
      useAuthStore.getState().bootstrap();
      navigate("/account/wallet", { replace: true });
    } else if (topupStatus === "failed") {
      toast.error("شارژ کیف پول ناموفق بود یا لغو شد");
      navigate("/account/wallet", { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <AccountLayout
      title="کیف پول"
      description="موجودی و فعالیت کیف پول شما"
    >
      <div className="bg-primary text-primary-foreground p-8 md:p-10 rounded-2xl">
          <p className="text-[11px] text-primary-foreground/60">
            موجودی در دسترس
          </p>
          <p className="mt-4 text-4xl md:text-5xl font-light">
            {formatAmount(wallet?.balance ?? 0)}
          </p>
          <p className="mt-4 text-sm text-primary-foreground/70 max-w-md">
            پرداخت و شارژ کیف پول موقتاً در دسترس نیست. موجودی شما در این صفحه قابل مشاهده است.
          </p>

          <p role="status" className="mt-8 text-sm">شارژ جدید کیف پول موقتاً غیرفعال است.</p>
        </div>

        <div className="mt-10">
          <h3 className="text-sm text-muted-foreground">فعالیت</h3>
          {transactions.length === 0 ? (
            <div className="mt-6 border border-border py-14 text-center rounded-2xl">
              <WalletIcon className="w-8 h-8 mx-auto text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-6 text-lg font-light text-foreground">هنوز فعالیتی در کیف پول وجود ندارد</p>
              <p className="mt-2 text-sm text-muted-foreground">
                استردادها و اعتبار فروشگاه در اینجا ظاهر می‌شوند.
              </p>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-border border border-border rounded-2xl overflow-hidden">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-4 px-6 py-5">
                  <div className="flex items-center gap-4">
                    <span className="w-9 h-9 border border-border flex items-center justify-center rounded-full">
                      {tx.amount >= 0 ? (
                        <ArrowDownLeft className="w-4 h-4 text-accent" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm text-foreground">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground tabular-nums">
                    {tx.amount >= 0 ? "+" : "−"}
                    {formatAmount(Math.abs(tx.amount))}
                  </p>
                </li>
            ))}
          </ul>
        )}
      </div>
    </AccountLayout>
  );
}
