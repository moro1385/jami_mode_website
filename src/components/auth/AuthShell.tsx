import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import setsImg from "@/assets/collections/sets.jpg";

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export default function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-[calc(100vh-104px)] grid lg:grid-cols-2 bg-[hsl(var(--warm-bg))]">
      <aside className="relative hidden lg:block overflow-hidden">
        <img
          src={setsImg}
          alt="جامی مد، پوشاک روزمره"
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-primary/55" />
        <div className="relative h-full flex flex-col justify-between p-12 xl:p-16">
          <Link to="/" className="text-2xl font-light uppercase tracking-[0.28em] text-primary-foreground">
            Jami<span className="font-medium text-accent">Mode</span>
          </Link>
          <div className="max-w-sm">
            <p className="text-xs font-medium text-primary-foreground/70">
              عضویت
            </p>
            <p className="mt-6 text-3xl xl:text-4xl font-light leading-snug text-primary-foreground">
              نیازهای هر روزه‌ی شما، در یک کمد لباس منظم.
            </p>
            <p className="mt-6 text-sm text-primary-foreground/75 leading-relaxed">
              اندازه‌ها و آدرس‌هایتان را ذخیره کنید، سفارش‌ها را پیگیری کنید و در چند ثانیه پرداخت را تمام کنید.
            </p>
          </div>
          <p className="text-xs text-primary-foreground/50">
            ساخته‌شده برای استفاده‌ی هر روز
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-16 sm:px-10 lg:px-16">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-3xl bg-white/50 border border-foreground/10 shadow-sm p-6 sm:p-8">
          {eyebrow && (
            <p className="text-xs font-medium text-accent">{eyebrow}</p>
          )}
          <h1 className="mt-4 text-3xl sm:text-4xl font-light text-foreground">{title}</h1>
          {subtitle && <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{subtitle}</p>}
          <div className="mt-10">{children}</div>
          {footer && <div className="mt-10 pt-8 border-t border-border">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
