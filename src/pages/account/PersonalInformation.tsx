import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import FormField from "@/components/auth/FormField";
import { useAuthStore } from "@/stores/authStore";
import { validateProfileForm } from "@/features/account/domain/forms";
import { formatPhone } from "@/lib/phone";
import { toast } from "sonner";

export default function PersonalInformation() {
  const ownerId = useAuthStore(state => state.user?.id);
  return <PersonalInformationContent key={ownerId ?? "signed-out"} />;
}

function PersonalInformationContent() {
  const user = useAuthStore((s) => s.user);
  const captureScope = useRequestScope(user?.id);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", email: user?.email ?? "" });
    setErrors({});
  }, [user]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isCurrent=captureScope(); if(!isCurrent())return;
    const next = validateProfileForm(form);
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await updateProfile(form);
      if(!isCurrent())return;
      toast.success("اطلاعات شما ذخیره شد");
    } catch {
      if(isCurrent())toast.error("ذخیره اطلاعات شما انجام نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      if(isCurrent())setSaving(false);
    }
  };

  return (
    <AccountLayout
      title="اطلاعات شخصی"
    
    >
      <form onSubmit={handleSubmit} className="max-w-xl space-y-6" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField
              label="نام"
              value={form.firstName}
              onChange={set("firstName")}
              error={errors.firstName}
              disabled={saving}
              maxLength={50}
            />
            <FormField
              label="نام خانوادگی"
              value={form.lastName}
              onChange={set("lastName")}
              error={errors.lastName}
              disabled={saving}
              maxLength={50}
            />
          </div>

          <FormField
            label="ایمیل (اختیاری)"
            type="email"
            value={form.email}
            onChange={set("email")}
            error={errors.email}
            disabled={saving}
            maxLength={255}
          />

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">شماره موبایل</p>
            <div className="h-12 border border-border bg-muted px-4 flex items-center text-sm text-muted-foreground rounded-xl">
              {user?.phone ? formatPhone(user.phone) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              شماره موبایل شما شناسه ورود شماست و در اینجا قابل تغییر نیست.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">عضو از</p>
            <p className="text-sm text-foreground">
              {user ? new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: "long" }) : "—"}
            </p>
          </div>

        <button
          type="submit"
          disabled={saving}
          className="h-12 px-8 bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center gap-2 rounded-full"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "ذخیره تغییرات"}
        </button>
      </form>
    </AccountLayout>
  );
}
