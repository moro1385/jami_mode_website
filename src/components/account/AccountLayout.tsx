import { Link, NavLink, useNavigate } from "react-router-dom";
import { useRef, useState, type ReactNode } from "react";
import { CreditCard, LogOut, MapPin, Package, ShoppingCart, User, RotateCcw, Mail } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const navItems = [
  { to: "/account", label: "اطلاعات شخصی", icon: User, end: true },
  { to: "/account/addresses", label: "آدرس‌ها", icon: MapPin },
  { to: "/account/wallet", label: "کیف پول", icon: CreditCard },
  { to: "/cart", label: "سبد خرید", icon: ShoppingCart },
  { to: "/account/orders", label: "سفارشات", icon: Package },
  { to: "/account/messages", label: "پیام‌ها", icon: Mail },
  { to: "/account/returns/new", label: "درخواست مرجوعی", icon: RotateCcw },
];

interface AccountLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function AccountLayout({ title, description, children }: AccountLayoutProps) {
  const navigate = useNavigate();
  const signOutLock = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  const handleSignOut = async () => {
    if (signOutLock.current) return;
    signOutLock.current = true; setSigningOut(true);
    try {
      await signOut();
      if (useAuthStore.getState().user) return;
      toast.success("شما خارج شدید");
      navigate("/", { replace: true });
    } catch { toast.error("تکمیل خروج از حساب تأیید نشد. اتصال را بررسی کنید."); }
    finally { signOutLock.current = false; setSigningOut(false); }
  };

  return (
    <div className="bg-[hsl(var(--warm-bg))] min-h-[calc(100vh-104px)]">
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <p className="text-[20px] text-accent">حساب کاربری</p>
        <p className="mt-4 text-3xl md:text-4xl font-light text-foreground">
          {displayName || "خوش آمدید"}
        </p>


        <div className="mt-12 flex flex-col md:flex-row gap-10 w-full overflow-hidden">
          <nav className="md:w-[260px] shrink-0 md:sticky md:top-32 h-max w-full">
            <ul className="flex flex-col gap-1 w-full bg-background border border-border p-2 rounded-2xl">
              {navItems.map((item) => (
                <li key={item.to} className="shrink-0 lg:shrink">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-4 py-3 text-xs whitespace-nowrap transition-colors rounded-xl",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="mt-4 w-full flex items-center gap-3 px-4 py-3 border border-border bg-background text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors rounded-full"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              خروج از حساب
            </button>

            <Link
              to="/shop"
              className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ادامه خرید
            </Link>
          </nav>

          <section className="bg-background border border-border p-6 md:p-10 animate-in fade-in duration-300 rounded-2xl w-full">
            <header className="pb-6 border-b border-border">
              <h1 className="text-xl font-light text-foreground">{title}</h1>
              {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
            </header>
            <div className="pt-8">{children}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
