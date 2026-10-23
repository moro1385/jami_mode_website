import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { adminCustomers, type CustomerSummary as Profile } from "@/features/customers/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function AdminUsers() {
  const ownerId = useAuthStore(state => state.user?.id);
  const load = useCallback(() => adminCustomers.list(), []);
  const { value, loading: isLoading, error, retry } = useScopedAsyncRead(ownerId, load);
  const users: Profile[] = value ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">کاربران</h1>
        <p className="text-muted-foreground mt-2">
          کاربران ثبت‌نام شده را در اینجا مدیریت کنید.
        </p>
      </div>

      <div className="bg-background rounded-2xl border">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <ReadFailure retry={retry} message="بارگیری کاربران با شکست مواجه شد." />
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            هیچ کاربری پیدا نشد.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شناسه کاربر</TableHead>
                <TableHead>نام</TableHead>
                <TableHead>تلفن</TableHead>
                <TableHead>تاریخ عضویت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {user.id}
                    </TableCell>
                    <TableCell className="font-medium">
                      {fullName || "N/A"}
                    </TableCell>
                    <TableCell>
                      {user.phone || "N/A"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(user.created_at), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
