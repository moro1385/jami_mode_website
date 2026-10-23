import { useCallback, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { adminDashboard } from '../dashboard';
export function useDashboard() {
  const ownerId = useAuthStore(state => state.user?.id);
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => adminDashboard.summary(), []);
  const state = useScopedAsyncRead(ownerId ? JSON.stringify([ownerId, attempt]) : undefined, load);
  return { stats: state.value, loading: state.loading, error: state.error, retry: () => setAttempt(value => value + 1) };
}
