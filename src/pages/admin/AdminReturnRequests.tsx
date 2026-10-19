import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import PrivateReturnImage from '@/components/returns/PrivateReturnImage';

type ReturnRequest = {
  id: string;
  user_id: string;
  order_id: string;
  phone: string;
  description: string;
  image_urls: string[];
  status: string;
  admin_note: string | null;
  created_at: string;
  orders: {
    id: string;
  };
  profiles: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  };
};

const statusTranslations: Record<string, string> = {
  pending: "در انتظار بررسی",
  approved: "تایید شده",
  rejected: "رد شده",
  completed: "تکمیل شده",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export default function AdminReturnRequests() {
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("return_requests")
        .select(`
          *,
          orders (id)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const reqs = data || [];
      if (reqs.length === 0) {
        setRequests([]);
        return;
      }

      const uniqueUserIds = Array.from(new Set(reqs.map(r => r.user_id)));

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .in("id", uniqueUserIds);

      if (profilesError) throw profilesError;

      type ProfileData = { id: string, first_name: string | null, last_name: string | null, phone: string | null };
      const profilesMap = (profilesData || []).reduce((acc: Record<string, ProfileData>, p) => {
        acc[p.id] = p as ProfileData;
        return acc;
      }, {});

      const mergedRequests = reqs.map((req) => ({
        ...req,
        profiles: profilesMap[req.user_id] || { first_name: null, last_name: null, phone: null }
      }));

      setRequests(mergedRequests as ReturnRequest[]);
    } catch (error: unknown) {
      toast.error("خطا در دریافت لیست درخواست‌های مرجوعی");
      if (error instanceof Error) {
        console.error("Error fetching return requests:", error.message);
      } else {
        console.error("Error fetching return requests:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateRequestStatus = async (id: string, newStatus: string) => {
    try {
      const { data, error } = await supabase
        .from("return_requests")
        .update({ status: newStatus })
        .eq("id", id).select("id,status").maybeSingle();

      if (error || !data || data.status !== newStatus) throw new Error("Status was not saved");

      toast.success("وضعیت درخواست با موفقیت تغییر کرد");
      setRequests((prev) =>
        prev.map((req) => (req.id === id ? { ...req, status: newStatus } : req))
      );
    } catch (error: unknown) {
      toast.error("خطا در تغییر وضعیت درخواست");
      if (error instanceof Error) {
        console.error("Error updating return request:", error.message);
      } else {
        console.error("Error updating return request:", error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">درخواست‌های مرجوعی</h1>
        <p className="text-muted-foreground mt-2">
          مدیریت درخواست‌های بازگشت کالا
        </p>
      </div>

      <div className="bg-background border rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">مشتری</th>
                <th className="px-4 py-3 font-medium">سفارش</th>
                <th className="px-4 py-3 font-medium">شماره تماس</th>
                <th className="px-4 py-3 font-medium">توضیحات</th>
                <th className="px-4 py-3 font-medium">تصاویر</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
                <th className="px-4 py-3 font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    در حال بارگذاری...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    هیچ درخواست مرجوعی یافت نشد
                  </td>
                </tr>
              ) : (
                requests.map((req) => {
                  const customerName = [req.profiles?.first_name, req.profiles?.last_name].filter(Boolean).join(" ");
                  const orderNumber = req.orders?.id?.split("-")[0].toUpperCase() || "نامشخص";

                  return (
                    <tr key={req.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{customerName || "کاربر ناشناس"}</span>
                          {!customerName && req.profiles?.phone && (
                            <span className="text-xs text-muted-foreground">{req.profiles.phone}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap" dir="ltr">
                        {orderNumber}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap" dir="ltr">
                        {req.phone}
                      </td>
                      <td className="px-4 py-4 max-w-[200px]">
                        <div className="line-clamp-2">{req.description}</div>
                        {req.description && req.description.length > 50 && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="link" size="sm" className="p-0 h-auto mt-1 text-primary">
                                مشاهده کامل
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>توضیحات مرجوعی</DialogTitle>
                              </DialogHeader>
                              <div className="mt-4 whitespace-pre-wrap break-words">
                                {req.description}
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {req.image_urls && req.image_urls.length > 0 ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <div className="flex -space-x-2 space-x-reverse cursor-pointer hover:opacity-80 transition-opacity">
                                {req.image_urls.slice(0, 3).map((url, i) => (
                                  <PrivateReturnImage key={i} reference={url} alt="تصویر مرجوعی" className="w-8 h-8 rounded-md object-cover border-2 border-background" />
                                ))}
                                {req.image_urls.length > 3 && (
                                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-medium border-2 border-background">
                                    +{req.image_urls.length - 3}
                                  </div>
                                )}
                              </div>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>تصاویر مرجوعی</DialogTitle>
                              </DialogHeader>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                                {req.image_urls.map((url, i) => (
                                  <PrivateReturnImage key={i} reference={url} openable alt={`تصویر مرجوعی ${i + 1}`} className="w-full h-40 object-cover rounded-lg border border-border" />
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-muted-foreground text-xs">ندارد</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            statusColors[req.status] || statusColors.pending
                          }`}
                        >
                          {statusTranslations[req.status] || req.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString("fa-IR")}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Select
                          value={req.status}
                          onValueChange={(val) => updateRequestStatus(req.id, val)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[130px]">
                            <SelectValue placeholder="تغییر وضعیت" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">در انتظار بررسی</SelectItem>
                            <SelectItem value="approved">تایید شده</SelectItem>
                            <SelectItem value="rejected">رد شده</SelectItem>
                            <SelectItem value="completed">تکمیل شده</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
