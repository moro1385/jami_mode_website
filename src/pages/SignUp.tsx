import { authPath, authReturn } from "@/lib/authReturn";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Check, Eye, EyeOff, Loader2, Lock, Smartphone, User, X } from "lucide-react";
import AuthShell from "@/components/auth/AuthShell";
import FormField from "@/components/auth/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthStore } from "@/stores/authStore";
import { PHONE_HELP, isValidPhone } from "@/lib/phone";
import { toast } from "sonner";

const sanitizePhoneInput = (val: string) => {
  const latinDigits = val.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
    String("0123456789"[d.charCodeAt(0) & 0xf])
  );
  return latinDigits.replace(/[^\d+ ]/g, "");
};

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = authReturn(location.search);
  const signUp = useAuthStore((s) => s.signUp);

  const [form, setForm] = useState({
    phone: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
    acceptedTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.phone.trim()) next.phone = "شماره موبایل خود را وارد کنید.";
    else if (!isValidPhone(form.phone)) next.phone = "این شماره موبایل معتبر نیست.";
    if (!form.firstName.trim()) next.firstName = "نام خود را وارد کنید.";
    else if (form.firstName.trim().length > 50) next.firstName = "کمتر از ۵۰ کاراکتر وارد کنید.";
    if (!form.lastName.trim()) next.lastName = "نام خانوادگی خود را وارد کنید.";
    else if (form.lastName.trim().length > 50) next.lastName = "کمتر از ۵۰ کاراکتر وارد کنید.";
    if (!form.password) next.password = "یک رمز عبور انتخاب کنید.";
    else if (form.password.length < 8) next.password = "حداقل از ۸ کاراکتر استفاده کنید.";
    else if (!/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password))
      next.password = "حداقل یک حرف و یک عدد باید وجود داشته باشد.";
    if (!form.confirmPassword) next.confirmPassword = "رمز عبور خود را تایید کنید.";
    else if (form.confirmPassword !== form.password) next.confirmPassword = "رمزهای عبور مطابقت ندارند.";
    if (!form.acceptedTerms) next.acceptedTerms = "برای ادامه باید قوانین را بپذیرید.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setLoading(true);

    // --- شروع کدهای تبدیل شماره ---
    let finalPhone = form.phone.trim();
    if (finalPhone.startsWith('0')) {
      finalPhone = '+98' + finalPhone.substring(1);
    } else if (!finalPhone.startsWith('+')) {
      finalPhone = '+98' + finalPhone;
    }
    // --- پایان کدهای تبدیل شماره ---

    try {
      await signUp({
        phone: finalPhone, // <-- اینجا به جای form.phone از finalPhone استفاده می‌کنیم
        firstName: form.firstName,
        lastName: form.lastName,
        password: form.password,
      });
      toast.success("حساب کاربری ایجاد شد. لطفاً شماره موبایل خود را تأیید کنید.");
      // Navigate to OTP verify passing the phone number in state
      const { normalizePhone } = await import("@/lib/phone");
      navigate(authPath("/signin/otp/verify", destination), { state: { phone: normalizePhone(finalPhone) }, replace: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "خطایی رخ داد. لطفاً دوباره تلاش کنید.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Password rules logic
  const hasMinLength = form.password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(form.password);
  const hasDigit = /\d/.test(form.password);
  const passedRulesCount = (hasMinLength ? 1 : 0) + (hasLetter ? 1 : 0) + (hasDigit ? 1 : 0);

  const getStrengthLabel = () => {
    if (!form.password) return "";
    if (passedRulesCount <= 1) return "ضعیف";
    if (passedRulesCount === 2) return "متوسط";
    return "قوی";
  };

  const isPasswordsMatching =
    form.confirmPassword.length > 0 && form.confirmPassword === form.password;

  return (
    <AuthShell
      eyebrow="کاربر جدید"
      title="ایجاد حساب کاربری"
      subtitle="با وارد کردن چند مشخصه، لباس‌ها، سفارشات و آدرس‌های شما در یک جا ذخیره می‌شوند."
      footer={
        <p className="text-sm text-muted-foreground">
          از قبل حساب کاربری دارید؟{" "}
          <Link
            to={authPath("/signin", destination)}
            className="text-foreground underline underline-offset-4 hover:text-accent transition-colors"
          >
            ورود
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
          value={form.phone}
          onChange={(e) => {
            const cleaned = sanitizePhoneInput(e.target.value);
            setForm((prev) => ({ ...prev, phone: cleaned }));
          }}
          error={errors.phone}
          hint={PHONE_HELP}
          disabled={loading}
          leading={<Smartphone className="w-4 h-4" />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField
            label="نام"
            autoComplete="given-name"
            value={form.firstName}
            onChange={set("firstName")}
            error={errors.firstName}
            disabled={loading}
            maxLength={50}
            leading={<User className="w-4 h-4" />}
          />
          <FormField
            label="نام خانوادگی"
            autoComplete="family-name"
            value={form.lastName}
            onChange={set("lastName")}
            error={errors.lastName}
            disabled={loading}
            maxLength={50}
            leading={<User className="w-4 h-4" />}
          />
        </div>

        <div className="space-y-3">
          <FormField
            label="رمز عبور"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="حداقل ۸ کاراکتر"
            value={form.password}
            onChange={set("password")}
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

          {/* Password strength & rules checklist */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">قدرت رمز عبور</span>
              {form.password && (
                <span
                  className={
                    passedRulesCount <= 1
                      ? "text-destructive font-medium"
                      : passedRulesCount === 2
                      ? "text-amber-600 font-medium"
                      : "text-emerald-600 font-medium"
                  }
                >
                  {getStrengthLabel()}
                </span>
              )}
            </div>

            {/* 3-segment strength bar */}
            <div className="grid grid-cols-3 gap-1.5 h-1.5">
              <div
                className={`rounded-full transition-colors ${
                  !form.password
                    ? "bg-muted"
                    : passedRulesCount <= 1
                    ? "bg-destructive"
                    : passedRulesCount === 2
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />
              <div
                className={`rounded-full transition-colors ${
                  passedRulesCount >= 2
                    ? passedRulesCount === 2
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                    : "bg-muted"
                }`}
              />
              <div
                className={`rounded-full transition-colors ${
                  passedRulesCount === 3 ? "bg-emerald-500" : "bg-muted"
                }`}
              />
            </div>

            {/* Rules checklist */}
            <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                {hasMinLength ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                )}
                <span className={hasMinLength ? "text-foreground font-medium" : ""}>
                  حداقل ۸ کاراکتر
                </span>
              </li>
              <li className="flex items-center gap-1.5">
                {hasLetter ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                )}
                <span className={hasLetter ? "text-foreground font-medium" : ""}>
                  شامل یک حرف انگلیسی
                </span>
              </li>
              <li className="flex items-center gap-1.5">
                {hasDigit ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                )}
                <span className={hasDigit ? "text-foreground font-medium" : ""}>
                  شامل یک عدد
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-1.5">
          <FormField
            label="تایید رمز عبور"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            error={errors.confirmPassword}
            disabled={loading}
            leading={<Lock className="w-4 h-4" />}
          />
          {isPasswordsMatching && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5 shrink-0" />
              رمزها مطابقت دارند
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="terms"
              checked={form.acceptedTerms}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, acceptedTerms: checked === true }))
              }
              className="mt-0.5"
            />
            <label htmlFor="terms" className="text-xs text-foreground/80 leading-relaxed cursor-pointer select-none">
              <Link
                to="/terms"
                target="_blank"
                className="text-foreground underline underline-offset-4 hover:text-accent"
              >
                قوانین و مقررات
              </Link>{" "}
              و{" "}
              <Link
                to="/privacy-policy"
                target="_blank"
                className="text-foreground underline underline-offset-4 hover:text-accent"
              >
                حریم خصوصی
              </Link>{" "}
              را می‌پذیرم
            </label>
          </div>
          {errors.acceptedTerms && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errors.acceptedTerms}
            </p>
          )}
        </div>

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
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>در حال ایجاد حساب...</span>
            </>
          ) : (
            "ایجاد حساب"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
