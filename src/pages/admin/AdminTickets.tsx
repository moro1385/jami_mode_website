import { useAuthStore } from '@/stores/authStore';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useAdminTickets } from '@/features/support/presentation/useAdminTickets';

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function AdminTickets() {
  const ownerId = useAuthStore(state => state.user?.id);
  const { tickets, loading, error, retry, pending, toggle: toggleTicketStatus } = useAdminTickets(ownerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">تیکت‌های پشتیبانی</h1>
        <p className="text-muted-foreground mt-2">
          مدیریت پیام‌های تماس با ما
        </p>
      </div>

      <div className="bg-background border rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">نام</th>
                <th className="px-4 py-3 font-medium">ایمیل</th>
                <th className="px-4 py-3 font-medium">موضوع</th>
                <th className="px-4 py-3 font-medium">پیام</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">تاریخ</th>
                <th className="px-4 py-3 font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    در حال بارگذاری...
                  </td>
                </tr>
              ) : error ? (<tr><td colSpan={7}><ReadFailure retry={retry} /></td></tr>) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    هیچ تیکتی یافت نشد
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      {ticket.first_name} {ticket.last_name}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap" dir="ltr">
                      {ticket.email || <span className="text-muted-foreground">بدون ایمیل</span>}
                    </td>
                    <td className="px-4 py-4 max-w-[200px] truncate" title={ticket.subject}>
                      {ticket.subject}
                    </td>
                    <td className="px-4 py-4 max-w-md whitespace-normal break-words">
                      <div className="line-clamp-2">{ticket.message}</div>
                      {ticket.message && ticket.message.length > 50 && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="link" size="sm" className="p-0 h-auto mt-1 text-primary">
                              مشاهده پیام
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>متن پیام</DialogTitle>
                            </DialogHeader>
                            <div className="mt-4 whitespace-pre-wrap break-words">
                              {ticket.message}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          ticket.status === "resolved"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}
                      >
                        {ticket.status === "resolved" ? "پاسخ داده شده" : "در انتظار بررسی"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {new Date(ticket.created_at).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending(ticket.id)}
                        onClick={() => toggleTicketStatus(ticket)}
                      >
                        {ticket.status === "resolved" ? "تغییر به در انتظار بررسی" : "تغییر به پاسخ داده شده"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
