import { useCallback } from 'react';
import { toast } from 'sonner';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { adminSupport, type SupportTicket } from '../admin';
export function useAdminTickets(ownerId?: string) {
 const load = useCallback(() => adminSupport.listTickets(), []);
 const read = useScopedAsyncRead(ownerId, load), actions = useScopedAction(ownerId);
 async function toggle(ticket: SupportTicket) {
  const result = await actions.run(ticket.id, () => adminSupport.toggleTicket(ticket));
  if (result.kind === 'success') { toast.success('وضعیت تیکت با موفقیت تغییر کرد'); read.retry(); }
  else if (result.kind === 'failed') { console.error('Ticket update failed:', result.error); toast.error('خطا در تغییر وضعیت تیکت'); }
 }
 return { tickets: read.value ?? [], loading: read.loading, error: read.error, retry: read.retry, pending: actions.pending, toggle };
}
