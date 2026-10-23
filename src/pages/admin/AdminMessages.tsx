import { useAuthStore } from '@/stores/authStore';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useAdminMessages } from '@/features/support/presentation/useAdminMessages';
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function AdminMessages() {
 const ownerId = useAuthStore(state => state.user?.id);
 return <AdminMessagesContent key={ownerId ?? 'signed-out'} ownerId={ownerId} />;
}
function AdminMessagesContent({ ownerId }: { ownerId?: string }) {
  const { users, messages, loadingUsers, loadingMessages, userError, messageError, retryUsers, retryMessages, displayName: getUserDisplayName, isSubmitting, send } = useAdminMessages(ownerId);

  // Form state
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [openUserSelect, setOpenUserSelect] = useState(false);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault(); setOpenUserSelect(false);
    if (await send(selectedUserId, title, body)) { setSelectedUserId(''); setTitle(''); setBody(''); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">پیام‌ها</h1>
        <p className="text-muted-foreground mt-2">
          ارسال و مدیریت پیام‌های کاربران
        </p>
      </div>

      {/* Compose Message Section */}
      <div className="bg-background border rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-6">ارسال پیام جدید</h2>
        {!!userError && <ReadFailure retry={retryUsers} message="خطا در دریافت لیست کاربران" />}
        <form onSubmit={handleSendMessage} className="space-y-4">
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-medium">گیرنده پیام</label>
            <Popover open={openUserSelect} onOpenChange={setOpenUserSelect}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openUserSelect}
                  className="w-full justify-between"
                  disabled={loadingUsers || !!userError || isSubmitting}
                >
                  {selectedUserId
                    ? getUserDisplayName(selectedUserId)
                    : loadingUsers
                    ? "در حال بارگذاری..."
                    : "انتخاب کاربر..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] max-w-full p-0">
                <Command>
                  <CommandInput placeholder="جستجوی کاربر..." />
                  <CommandList>
                    <CommandEmpty>کاربری یافت نشد.</CommandEmpty>
                    <CommandGroup>
                      {users.map((user) => {
                        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
                        const label = fullName ? `${fullName} — ${user.phone || 'بدون شماره'}` : (user.phone || user.id);
                        return (
                          <CommandItem
                            key={user.id}
                            disabled={isSubmitting}
                            value={label}
                            onSelect={() => {
                              setSelectedUserId(user.id);
                              setOpenUserSelect(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedUserId === user.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {label}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label htmlFor="admin-message-title" className="text-sm font-medium">عنوان پیام</label>
            <Input
              id="admin-message-title"
              value={title}
              disabled={isSubmitting}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان پیام را وارد کنید"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="admin-message-body" className="text-sm font-medium">متن پیام</label>
            <Textarea
              id="admin-message-body"
              value={body}
              disabled={isSubmitting}
              onChange={(e) => setBody(e.target.value)}
              placeholder="متن پیام را وارد کنید"
              className="min-h-[120px]"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={!!userError || loadingUsers || !selectedUserId || !title.trim() || !body.trim() || isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                در حال ارسال...
              </>
            ) : (
              "ارسال پیام"
            )}
          </Button>
        </form>
      </div>

      {/* Sent Messages History */}
      <div className="bg-background border rounded-2xl">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">تاریخچه پیام‌های ارسال شده</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">گیرنده</th>
                <th className="px-4 py-3 font-medium">عنوان</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">تاریخ ارسال</th>
                <th className="px-4 py-3 font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingMessages ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    <div className="flex justify-center items-center">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      در حال بارگذاری...
                    </div>
                  </td>
                </tr>
              ) : messageError ? (<tr><td colSpan={5}><ReadFailure retry={retryMessages} message="خطا در دریافت لیست پیام‌ها" /></td></tr>) : messages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    هیچ پیامی ارسال نشده است
                  </td>
                </tr>
              ) : (
                messages.map((message) => (
                  <tr key={message.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getUserDisplayName(message.user_id)}
                    </td>
                    <td className="px-4 py-4 max-w-[200px] truncate" title={message.title}>
                      {message.title}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          message.is_read
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}
                      >
                        {message.is_read ? "خوانده شده" : "خوانده نشده"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {new Date(message.created_at).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            مشاهده
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{message.title}</DialogTitle>
                          </DialogHeader>
                          <div className="mt-4 text-sm">
                            <div className="mb-2 text-muted-foreground">
                              گیرنده: {getUserDisplayName(message.user_id)}
                            </div>
                            <div className="whitespace-pre-wrap break-words bg-muted/30 p-4 rounded-lg">
                              {message.body}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
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
