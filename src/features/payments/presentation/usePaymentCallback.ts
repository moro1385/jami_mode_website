import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { paymentCallbacks } from '../payments';
export function usePaymentCallback(kind: 'order' | 'wallet') {
  const [params] = useSearchParams(), navigate = useNavigate();
  const ownerId = useAuthStore(state => state.user?.id);
  const id = params.get(kind === 'order' ? 'order_id' : 'topup_id'), trans = params.get('trans_id'), reference = params.get('id_get');
  const key = JSON.stringify([kind, ownerId, id, trans, reference]);
  const request = useRef<{ key: string; promise: Promise<string> } | null>(null);
  useEffect(() => {
    let active = true;
    // StrictMode's second effect setup observes the same in-flight verification, not a second request.
    if (!request.current || request.current.key !== key) request.current = { key, promise: paymentCallbacks[kind](id, { trans_id: trans, id_get: reference }) };
    void request.current.promise.then(destination => { if (active) navigate(destination, { replace: true }); });
    return () => { active = false; };
  }, [key, kind, id, trans, reference, navigate]);
}
