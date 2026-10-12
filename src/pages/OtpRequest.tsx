import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Smartphone } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import FormField from "@/components/auth/FormField";
import { useAuthStore } from "@/stores/authStore";
import { PHONE_HELP, isValidPhone, normalizePhone } from "@/lib/phone";
import { setOtpSentAt } from "@/lib/otpTimer";
import { toast } from "sonner";

const sanitizePhoneInput = (val: string) => {
  const latinDigits = val.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
    String("0123456789"[d.charCodeAt(0) & 0xf])
  );
  return latinDigits.replace(/[^\d+ ]/g, "");
};

export default function OtpRequest() {
  const navigate = useNavigate();
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!phone.trim()) return setError("شماره موبایل خود را وارد کنید.");
    if (!isValidPhone(phone)) return setError("این شماره موبایل معتبر نیست.");
    setError("");
    setLoading(true);
    try {
      const normalized = normalizePhone(phone);
      const result = await requestOtp(normalized);
      setOtpSentAt(normalized);
      if (result.devCode) toast.info(`کد آزمایشی: ${result.devCode}`, { duration: 15000 });
      else toast.success("کد تایید ارسال شد");
      navigate("/signin/otp/verify", { state: { phone: normalized } });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "کد ارسال نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="رمز یک‌بار مصرف"
      title="ورود با کد"
      subtitle="شماره موبایل خود را وارد کنید تا یک کد تایید ۶ رقمی برای شما پیامک شود."
      footer={
        <Link
          to="/signin"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          بازگشت به ورود با رمز عبور
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormField
          label="شماره موبایل"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="text-left"
          placeholder="0912 345 6789"
          value={phone}
          onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
          error={error}
          hint={PHONE_HELP}
          disabled={loading}
          leading={<Smartphone className="w-4 h-4" />}
        />

        {formError && (
          <p className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive rounded-xl">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "ارسال رمز یک‌بار مصرف"}
        </button>
      </form>
    </AuthShell>
  );
}
