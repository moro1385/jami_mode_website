import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Upload, X, ArrowRight } from "lucide-react";
import AccountLayout from "@/components/account/AccountLayout";
import { useAuthStore } from "@/stores/authStore";
import { returnsService } from "@/features/returns/returns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizePhone, isValidPhone } from "@/lib/phone";

import { uploadReturnImages, cleanupReturnImages, validateReturnImage } from '@/lib/returnImages';


export default function ReturnRequest() {
  const ownerId = useAuthStore(state => state.user?.id);
  return <ReturnRequestContent key={ownerId ?? "signed-out"} />;
}

function ReturnRequestContent() {
  const user = useAuthStore((s) => s.user);
  const captureScope = useRequestScope(user?.id);
  const navigate = useNavigate();

  const ownerId = user?.id;
  const loadOrders = useCallback(() => returnsService.listOrders(ownerId!), [ownerId]);
  const orderRead = useScopedAsyncRead(ownerId, loadOrders);
  const orders = orderRead.value ?? [], loadingOrders = orderRead.loading;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<{ phone?: string; description?: string }>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter((file) => (() => { try { validateReturnImage(file); return true; } catch { return false; } })());

      if (validFiles.length !== selectedFiles.length) {
        toast.error("لطفاً فقط فایل‌های تصویری آپلود کنید.");
      }

      setFiles((prev) => [...prev, ...validFiles].slice(0, 5)); // Limit to 5 images
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Inline validation
    const newErrors: { phone?: string; description?: string } = {};
    if (orderRead.error || !orders.some(order => order.id === selectedOrderId)) {
      toast.error("لطفاً یک سفارش را انتخاب کنید.");
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    if (!phone.trim()) {
      newErrors.phone = "شماره تماس الزامی است.";
    } else if (!isValidPhone(normalizedPhone)) {
      newErrors.phone = "شماره موبایل نامعتبر است (مثال: ۰۹۱۲۳۴۵۶۷۸۹)";
    }

    if (!description.trim()) {
      newErrors.description = "توضیحات مرجوعی الزامی است.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!user || isSubmitting) return;
    const isCurrent=captureScope(); if(!isCurrent())return;
    setErrors({});
    setIsSubmitting(true);
    let uploadedPaths: string[] = [];
    try {
      // 1. Upload images first
      uploadedPaths = await uploadReturnImages(user.id, files);
      if(!isCurrent()){ await cleanupReturnImages(uploadedPaths); return; }

      // 2. Create the return request record
      try {
        await returnsService.submit({
          user_id: user.id, order_id: selectedOrderId, phone: normalizedPhone,
          description, image_urls: uploadedPaths,
        });
      } catch {
        await cleanupReturnImages(uploadedPaths);
        throw new Error("خطا در ثبت درخواست. لطفاً دوباره تلاش کنید.");
      }

      if(!isCurrent())return;
      toast.success("درخواست مرجوعی شما با موفقیت ثبت شد.");
      navigate("/account/orders");
    } catch (error) {
      if(!isCurrent())return;
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("خطا در ثبت درخواست");
      }
    } finally {
      if(isCurrent())setIsSubmitting(false);
    }
  };

  if (loadingOrders) {
    return (
      <AccountLayout title="درخواست مرجوعی" description="فرم درخواست مرجوعی کالا">
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AccountLayout>
    );
  }

  if (orderRead.error) return <AccountLayout title="درخواست مرجوعی"><ReadFailure retry={orderRead.retry} message="خطا در دریافت سفارشات" /></AccountLayout>;

  return (
    <AccountLayout title="درخواست مرجوعی" description="ثبت درخواست مرجوعی برای سفارشات">
      <div className="max-w-2xl mx-auto bg-card rounded-2xl border border-border overflow-hidden">
        <div className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Order Selection */}
            <div className="space-y-2">
              <label htmlFor="orderId" className="block text-sm font-medium text-foreground">
                انتخاب سفارش
              </label>
              <select
                id="orderId"
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full h-11 px-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                required
              >
                <option value="" disabled>سفارش مورد نظر را انتخاب کنید</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    سفارش {order.number} - {new Date(order.createdAt).toLocaleDateString("fa-IR")}
                  </option>
                ))}
              </select>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                شماره تماس (جهت هماهنگی)
              </label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) setErrors({ ...errors, phone: undefined });
                }}
                placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                className={`text-left font-sans ${errors.phone ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                dir="ltr"
                required
              />
              {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone}</p>}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label htmlFor="description" className="block text-sm font-medium text-foreground">
                علت مرجوعی
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) setErrors({ ...errors, description: undefined });
                }}
                placeholder="لطفاً توضیح دهید کدام کالا و به چه علتی مرجوع می‌شود..."
                rows={4}
                required
                className={`resize-none ${errors.description ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {errors.description && <p className="text-sm text-destructive mt-1">{errors.description}</p>}
            </div>

            {/* Image Upload */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                تصاویر کالا (اختیاری)
              </label>
              <div className="flex flex-wrap gap-4">
                {files.map((file, index) => (
                  <div key={index} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Preview ${index}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width={80}
                      height={80}
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute inset-0 bg-background/50 backdrop-blur-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-5 h-5 text-foreground" />
                    </button>
                  </div>
                ))}
                {files.length < 5 && (
                  <label className="w-20 h-20 flex flex-col items-center justify-center rounded-xl border border-dashed border-border hover:border-foreground/50 transition-colors cursor-pointer bg-muted/20">
                    <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                    <span className="text-[10px] text-muted-foreground">آپلود</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                حداکثر ۵ تصویر از کالا و مشکل آن (فرمت‌های JPG، PNG)
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-border">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 rounded-lg text-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    ثبت درخواست
                    <ArrowRight className="w-4 h-4 mr-2" />
                  </>
                )}
              </Button>
            </div>

          </form>
        </div>
      </div>
    </AccountLayout>
  );
}
