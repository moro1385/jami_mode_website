import { useCallback } from 'react';
import { toast } from 'sonner';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { adminCustomers, customerDisplayName } from '@/features/customers/admin';
import { adminSupport } from '../admin';
export function useAdminMessages(ownerId?: string) {
 const loadUsers = useCallback(() => adminCustomers.list(), []);
 const loadMessages = useCallback(() => adminSupport.listMessages(), []);
 const users = useScopedAsyncRead(ownerId, loadUsers), messages = useScopedAsyncRead(ownerId, loadMessages), actions = useScopedAction(ownerId);
 async function send(recipient: string, title: string, body: string) {
  if (!title.trim() || !body.trim() || users.error || !users.value?.some(user => user.id === recipient)) return false;
  const result = await actions.run('send', () => adminSupport.sendMessage(recipient, title, body));
  if (result.kind === 'success') { toast.success('پیام با موفقیت ارسال شد'); messages.retry(); return true; }
  if (result.kind === 'failed') { console.error('Message submission failed:', result.error); toast.error('خطا در ارسال پیام'); }
  return false;
 }
 return { users: users.value ?? [], messages: messages.value ?? [], loadingUsers: users.loading, loadingMessages: messages.loading,
  userError: users.error, messageError: messages.error, retryUsers: users.retry, retryMessages: messages.retry,
  displayName: (id: string) => customerDisplayName(users.value ?? [], id), isSubmitting: actions.pending('send'), send };
}
