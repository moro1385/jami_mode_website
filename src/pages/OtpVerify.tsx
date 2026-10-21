import { authPath, authReturn } from "@/lib/authReturn";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import { formatPhone } from "@/lib/phone";
import { formatCountdown, getOtpRemainingSeconds, setOtpSentAt } from "@/lib/otpTimer";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

export default function OtpVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = authReturn(location.search);
  const phone = (location.state as { phone?: string } | null)?.phone ?? "";
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const requestOtp = useAuthStore((s) => s.requestOtp);

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [remaining, setRemaining] = useState(() => (phone ? getOtpRemainingSeconds(phone) : 0));

  useEffect(() => {
    if (!phone) navigate(authPath("/signin/otp", destination), { replace: true });
  }, [phone, navigate, destination]);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError("کد ۶ رقمی را وارد کنید.");
    setError("");
    setLoading(true);
    try {
      await verifyOtp(phone, code);
      toast.success("شما وارد شدید");
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تایید کد انجام نشد. لطفاً دوباره تلاش کنید.");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    try {
      const result = await requestOtp(phone);
      setOtpSentAt(phone);
      setRemaining(result.expiresInSeconds);
      setCode("");
      if (result.devCode) toast.info(`کد آزمایشی: ${result.devCode}`, { duration: 15000 });
      else toast.success("کد جدید ارسال شد");
    } catch {
      setError("کد مجدداً ارسال نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      eyebrow="تایید شماره"
      title="کد تایید را وارد کنید"
      subtitle={
        <>
          ما یک کد تایید ۶ رقمی به شماره{" "}
          <span className="text-foreground" dir="ltr">{formatPhone(phone)}</span> ارسال کردیم. این کد ۵ دقیقه اعتبار دارد.
        </>
      }
      footer={
        <Link
          to={authPath("/signin/otp", destination)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          استفاده از شماره دیگر
        </Link>
      }
    >
      <form onSubmit={handleVerify} className="space-y-6" noValidate>
        <div className="space-y-2">
          <label htmlFor="otp" className="block text-xs font-medium text-foreground/80">
            کد تایید
          </label>
          <input
            id="otp"
            value={code}
            onChange={(e) => {
              const latinDigits = e.target.value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
                String("0123456789"[d.charCodeAt(0) & 0xf])
              );
              setCode(latinDigits.replace(/\D/g, "").slice(0, 6));
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="––––––"
            disabled={loading}
            aria-invalid={!!error}
            className={`w-full h-14 bg-white border border-foreground/25 shadow-xs rounded-xl px-4 text-center text-2xl tracking-[0.5em] text-foreground outline-hidden transition-colors hover:border-foreground/45 focus:border-accent focus:ring-2 focus:ring-accent/20 ${
              error ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""
            }`}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-xs hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تایید و ادامه"}
        </button>

        <div className="text-center text-sm">
          {remaining > 0 ? (
            <p className="text-muted-foreground">
              شما می‌توانید درخواست کد جدید کنید در{" "}
              <span className="text-foreground tabular-nums">{formatCountdown(remaining)}</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-foreground underline underline-offset-4 hover:text-accent transition-colors disabled:opacity-60"
            >
              {resending ? "در حال ارسال..." : "ارسال مجدد کد"}
            </button>
          )}
        </div>
      </form>
    </AuthShell>
  );
}
