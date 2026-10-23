import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { gatewayCheckout } from '../gateway';
import type { GatewayQuote } from '../domain/checkout';
import type { CheckoutSelection } from '../domain/wallet';
export function useGatewayCheckout(ownerId: string | undefined, selection: CheckoutSelection) {
  const navigate = useNavigate(), scope = JSON.stringify([ownerId, selection]);
  const scopeRef = useRef(scope), generation = useRef(0);
  if (scopeRef.current !== scope) { scopeRef.current = scope; generation.current++; }
  const lifetime = useRef({ active: true });
  useEffect(() => { const token = { active: true }; lifetime.current = token; return () => { token.active = false; }; }, []);
  const lock = useRef<{ generation: number } | null>(null);
  const [state, setState] = useState<{ generation: number; quote: GatewayQuote | null; busy: boolean }>({ generation: 0, quote: null, busy: false });
  const visible = state.generation === generation.current ? state : { quote: null, busy: false };
  const handleGatewayOrder = async () => {
    const version = generation.current, token = lifetime.current;
    if (!ownerId || lock.current?.generation === version) return;
    const current = () => token.active && lifetime.current === token && generation.current === version && useAuthStore.getState().user?.id === ownerId;
    if (!current()) return;
    const attempt = { generation: version }; lock.current = attempt;
    setState({ generation: version, quote: visible.quote, busy: true });
    try {
      const result = await gatewayCheckout.step(ownerId, selection, visible.quote, current);
      if (!current() || result.kind === 'stale') return;
      if (result.kind === 'quote') { setState({ generation: version, quote: result.quote, busy: true }); return; }
      if (['expired', 'limit', 'rejected'].includes(result.kind)) setState({ generation: version, quote: null, busy: true });
      if (result.kind === 'expired') toast.info('مهلت سفارش قبلی تمام شده است. مبلغ و موجودی را دوباره بررسی کنید.');
      else if (result.kind === 'limit') toast.error('چند سفارش پرداخت‌نشده دارید. ابتدا وضعیت سفارش‌های قبلی را پیگیری کنید.', { action: { label: 'سفارش‌های من', onClick: () => navigate('/account/orders') } });
      else if (result.kind === 'ambiguous') toast.error('وضعیت پرداخت هنوز مشخص نیست. اگر وجه کسر شده، پیش از پرداخت دوباره سفارش را پیگیری کنید.', { action: { label: 'پیگیری سفارش', onClick: () => navigate('/account/orders') } });
      else if (result.kind === 'paid') navigate('/checkout/success?order=' + encodeURIComponent(result.orderId));
      else if (result.kind === 'redirect') window.location.href = result.url;
      else if (result.kind === 'failed') toast.error(result.message);
      else if (result.kind === 'rejected') throw Error('Checkout rejected');
    } catch (error) {
      if (current()) { console.error('Order error', error); toast.error('ثبت سفارش با شکست مواجه شد. لطفاً دوباره تلاش کنید.'); }
    } finally {
      if (lock.current === attempt) lock.current = null;
      if (current()) setState(previous => previous.generation === version ? { ...previous, busy: false } : previous);
    }
  };
  return { quote: visible.quote, busy: visible.busy, handleGatewayOrder };
}
