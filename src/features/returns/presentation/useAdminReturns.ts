import { useCallback } from 'react';
import { toast } from 'sonner';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { returnsService } from '../returns';
export function useAdminReturns(ownerId?: string) {
 const load = useCallback(() => returnsService.listAdmin(), []);
 const read = useScopedAsyncRead(ownerId, load), actions = useScopedAction(ownerId);
 async function changeStatus(id: string, status: string) {
  if (!read.value?.some(row => row.id === id)) return;
  const result = await actions.run(id, () => returnsService.changeStatus(id, status));
  if (result.kind === 'success') { toast.success('وضعیت درخواست با موفقیت تغییر کرد'); read.retry(); }
  else if (result.kind === 'failed') { console.error('Return update failed:', result.error); toast.error('خطا در تغییر وضعیت درخواست'); read.retry(); }
 }
 return { requests: read.value ?? [], loading: read.loading, error: read.error, retry: read.retry, pending: actions.pending, changeStatus };
}
