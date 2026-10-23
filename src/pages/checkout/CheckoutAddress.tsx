import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, MapPin, Pencil, Plus, Star, Trash2, X, ChevronRight } from "lucide-react";
import FormField from "@/components/auth/FormField";
import { useAuthStore } from "@/stores/authStore";
import { useCheckoutStore } from "@/stores/checkoutStore";
import type { Address } from "@/types/auth";
import { formatPhone } from "@/lib/phone";
import { emptyAddressForm as emptyForm, validateAddressForm, addressFormInput } from "@/features/account/domain/forms";
import { shippingMethods as SHIPPING_METHODS, reconcileCheckoutAddress } from "@/features/payments/domain/checkout";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CheckoutAddress() {
  const ownerId = useAuthStore(state => state.user?.id);
  return <CheckoutAddressContent key={ownerId ?? "signed-out"} />;
}

function CheckoutAddressContent() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const captureScope = useRequestScope(user?.id);
  const upsertAddress = useAuthStore((s) => s.upsertAddress);
  const deleteAddress = useAuthStore((s) => s.deleteAddress);
  const setDefaultAddress = useAuthStore((s) => s.setDefaultAddress);

  const { selectedAddress, shippingMethod, setAddress, setShippingMethod } = useCheckoutStore();

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const addresses = user?.addresses ?? [];

  useEffect(() => {
    const next = reconcileCheckoutAddress(user?.addresses ?? [], selectedAddress);
    if (next !== selectedAddress) setAddress(next);
  }, [user?.addresses, selectedAddress, setAddress]);

  const openNew = () => {
    setForm({ ...emptyForm, isDefault: addresses.length === 0 });
    setErrors({});
    setEditing("new");
  };

  const openEdit = (address: Address) => {
    setForm({ ...emptyForm, ...address, line2: address.line2 ?? "" });
    setErrors({});
    setEditing(address.id);
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const isCurrent=captureScope(); if(!isCurrent())return;
    const next = validateAddressForm(form);
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await upsertAddress(addressFormInput(form, editing));
      if(!isCurrent())return;
      toast.success(editing === "new" ? "آدرس اضافه شد" : "آدرس به‌روز شد");
      setEditing(null);
    } catch {
      if(isCurrent())toast.error("ذخیره این آدرس انجام نشد.");
    } finally {
      if(isCurrent())setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    const isCurrent=captureScope(); if(!isCurrent())return;
    setBusy(true);
    try {
      await deleteAddress(id);
      if(!isCurrent())return;
      toast.success("آدرس حذف شد");
      if (selectedAddress?.id === id) {
          setAddress(null);
      }
    } catch {
      if(isCurrent())toast.error("حذف این آدرس انجام نشد.");
    } finally {
      if(isCurrent())setBusy(false);
    }
  };

  const handleDefault = async (id: string) => {
    const isCurrent=captureScope(); if(!isCurrent())return;
    setBusy(true);
    try { await setDefaultAddress(id); }
    catch { if(isCurrent())toast.error("تغییر آدرس پیش‌فرض انجام نشد."); }
    finally { if(isCurrent())setBusy(false); }
  };

  const handleNextStep = () => {
    if (!selectedAddress || !addresses.some(address => address.id === selectedAddress.id)) {
      toast.error("لطفاً یک آدرس تحویل انتخاب کنید.");
      return;
    }
    if (!SHIPPING_METHODS.some(method => method.id === shippingMethod)) {
      toast.error("لطفاً یک روش ارسال انتخاب کنید.");
      return;
    }
    navigate("/checkout/payment");
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-24">
      <h1 className="text-2xl font-medium text-foreground mb-8">تسویه حساب</h1>

      <div className="flex items-center gap-2 mb-12 text-sm text-muted-foreground">
        <span className="text-foreground font-medium">۱. آدرس و ارسال</span>
        <ChevronRight className="w-4 h-4" />
        <span>۲. بازبینی و پرداخت</span>
      </div>

      <div className="space-y-12">
        <section>
          <h2 className="text-lg font-medium text-foreground mb-6">آدرس تحویل</h2>

          {editing ? (
            <form onSubmit={handleSave} className="max-w-xl space-y-6 bg-muted/30 p-6 border border-border rounded-2xl" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormField label="نام آدرس" placeholder="خانه" value={form.label} onChange={set("label")} error={errors.label} disabled={busy} maxLength={40} />
                <FormField label="گیرنده" value={form.recipient} onChange={set("recipient")} error={errors.recipient} disabled={busy} maxLength={80} />
              </div>
              <FormField label="شماره تماس" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} error={errors.phone} disabled={busy} />
              <FormField label="آدرس خیابان" value={form.line1} onChange={set("line1")} error={errors.line1} disabled={busy} maxLength={120} />
              <FormField label="آپارتمان، واحد (اختیاری)" value={form.line2} onChange={set("line2")} disabled={busy} maxLength={120} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <FormField label="شهر" value={form.city} onChange={set("city")} error={errors.city} disabled={busy} maxLength={60} />
                <FormField label="کشور" value={form.country} onChange={set("country")} error={errors.country} disabled={busy} maxLength={60} />
                <FormField label="کد پستی" value={form.postalCode} onChange={set("postalCode")} error={errors.postalCode} disabled={busy} maxLength={20} />
              </div>

              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                  disabled={busy}
                  className="w-4 h-4 accent-[hsl(var(--accent))]"
                />
                تنظیم به عنوان آدرس پیش‌فرض تحویل
              </label>

              <div className="flex flex-wrap gap-3 mt-6">
                <button
                  type="submit"
                  disabled={busy}
                  className="h-10 px-6 bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity disabled:opacity-60 inline-flex items-center gap-2 rounded-full"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  ذخیره آدرس
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={busy}
                  className="h-10 px-6 border border-border text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2 rounded-full"
                >
                  <X className="w-4 h-4" />
                  لغو
                </button>
              </div>
            </form>
          ) : addresses.length === 0 ? (
            <div className="text-center py-12 border border-border rounded-2xl">
              <MapPin className="w-8 h-8 mx-auto text-muted-foreground" strokeWidth={1.25} />
              <p className="mt-6 text-lg font-light text-foreground">هنوز آدرسی ذخیره نشده است</p>
              <button
                onClick={openNew}
                className="mt-8 h-12 px-8 bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity inline-flex items-center gap-2 rounded-full"
              >
                <Plus className="w-4 h-4" />
                افزودن آدرس
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {addresses.map((address) => (
                <div
                  key={address.id}
                  onClick={() => setAddress(address)}
                  className={cn(
                    "relative border p-6 cursor-pointer transition-colors hover:border-foreground/30 rounded-2xl",
                    selectedAddress?.id === address.id ? "border-accent bg-accent/5" : "border-border"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        <input
                          type="radio"
                          readOnly
                          checked={selectedAddress?.id === address.id}
                          className="w-4 h-4 accent-accent cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm text-foreground">{address.label}</h3>
                          {address.isDefault && (
                            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1">
                              پیش‌فرض
                            </span>
                          )}
                        </div>
                        <p className="mt-3 text-sm text-foreground">{address.recipient}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {address.line1}
                          {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.country} {address.postalCode}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{formatPhone(address.phone)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      {!address.isDefault && (
                        <button
                          onClick={() => handleDefault(address.id)}
                          disabled={busy}
                          aria-label="Set as default"
                          className="text-muted-foreground hover:text-accent transition-colors"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(address)}
                        disabled={busy}
                          aria-label="Edit address"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(address.id)}
                        disabled={busy}
                          aria-label="Delete address"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={openNew}
                className="h-12 px-8 border border-foreground text-xs text-foreground hover:bg-foreground hover:text-primary-foreground transition-colors inline-flex items-center gap-2 rounded-full"
              >
                <Plus className="w-4 h-4" />
                افزودن آدرس دیگر
              </button>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground mb-6">روش ارسال</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SHIPPING_METHODS.map((method) => (
              <label
                key={method.id}
                className={cn(
                  "flex items-center justify-between p-6 border cursor-pointer transition-colors hover:border-foreground/30 rounded-2xl",
                  shippingMethod === method.id ? "border-accent bg-accent/5" : "border-border"
                )}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="radio"
                    name="shipping_method"
                    checked={shippingMethod === method.id}
                    onChange={() => setShippingMethod(method.id, method.cost)}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                  <span className="text-sm font-medium text-foreground">{method.label}</span>
                </div>
                <span className="text-sm text-foreground">
                  {new Intl.NumberFormat('fa-IR').format(method.cost)} ریال
                </span>
              </label>
            ))}
          </div>
          {shippingMethod === "tipax" && (
            <div className="mt-4 p-4 bg-muted/50 border border-border rounded-xl text-sm text-foreground leading-relaxed">
              مشخصات ارسال و لینک پرداخت نهایت تا دو روز براتون ارسال میشه و هزینه ارسال رو از اون لینک میزنین
            </div>
          )}
        </section>

        <div className="flex justify-end pt-8 border-t border-border">
          <button
            onClick={handleNextStep}
            className="h-14 px-10 bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity rounded-full"
          >
            مرحله بعد
          </button>
        </div>
      </div>
    </div>
  );
}
