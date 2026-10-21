import { authPath, authReturn } from "@/lib/authReturn";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, MessageSquare, Smartphone } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import FormField from "@/components/auth/FormField";
import { useAuthStore } from "@/stores/authStore";
import { PHONE_HELP, isValidPhone } from "@/lib/phone";
import { toast } from "sonner";

const sanitizePhoneInput = (val: string) => {
  const latinDigits = val.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
    String("0123456789"[d.charCodeAt(0) & 0xf])
  );
  return latinDigits.replace(/[^\d+ ]/g, "");
};

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = authReturn(location.search);
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!phone.trim()) next.phone = "شماره موبایل خود را وارد کنید.";
    else if (!isValidPhone(phone)) next.phone = "این شماره موبایل معتبر نیست.";
    if (!password) next.password = "رمز عبور خود را وارد کنید.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setLoading(true);

    // --- شروع کدهای تبدیل شماره ---
    let finalPhone = phone.trim();
    if (finalPhone.startsWith('0')) {
      finalPhone = '+98' + finalPhone.substring(1);
    } else if (!finalPhone.startsWith('+')) {
      finalPhone = '+98' + finalPhone;
    }
    // --- پایان کدهای تبدیل شماره ---

    try {
      await signInWithPassword(finalPhone, password); // <-- اینجا finalPhone رو به تابع میدیم
      toast.success("خوش آمدید");
      navigate(destination, { replace: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "خطایی رخ داد. لطفاً دوباره تلاش کنید.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="حساب کاربری"
      title="ورود"
      subtitle="از شماره موبایل و رمز عبور خود استفاده کنید یا با یک کد یک‌بار مصرف وارد شوید."
      footer={
        <p className="text-sm text-muted-foreground">
          حساب کاربری ندارید؟{" "}
          <Link to={authPath("/signup", destination)} className="text-foreground underline underline-offset-4 hover:text-accent transition-colors">
            ثبت نام
          </Link>
        </p>
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
          error={errors.phone}
          hint={PHONE_HELP}
          disabled={loading}
          leading={<Smartphone className="w-4 h-4" />}
        />

        <FormField
          label="رمز عبور"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          disabled={loading}
          leading={<Lock className="w-4 h-4" />}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        {formError && (
          <p className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive rounded-xl">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-xs hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "ورود"}
        </button>

        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] text-muted-foreground">یا</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Link
          to={authPath("/signin/otp", destination)}
          className="w-full h-12 rounded-full border border-foreground text-foreground text-sm font-medium hover:bg-foreground hover:text-primary-foreground transition-colors flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          ورود با رمز یک‌بار مصرف
        </Link>
      </form>
    </AuthShell>
  );
}
