import type { PaymentTransport } from './paymentPorts';
type Callback = { trans_id: string | null; id_get: string | null };
export function createCallbackService(transport: PaymentTransport) {
  return {
    async order(orderId: string | null, callback: Callback) {
      if (!orderId) return '/checkout/failed?reason=invalid';
      const encoded = encodeURIComponent(orderId);
      try {
        const { ok, result } = await transport.verify('order', { order_id: orderId, ...callback });
        if (ok && result.success) return '/checkout/success?order=' + encoded;
        return '/checkout/failed?order=' + encoded + '&reason=' + encodeURIComponent(ok ? result.reason || 'error' : 'error');
      } catch { return '/checkout/failed?order=' + encoded + '&reason=error'; }
    },
    async wallet(topupId: string | null, callback: Callback) {
      if (!topupId) return '/account/wallet?topup=failed';
      let state = 'pending';
      try {
        const { ok, result } = await transport.verify('wallet', { topup_id: topupId, ...callback });
        if (ok && result.reason === 'cancelled') state = 'cancelled';
      } catch { /* A lost response is pending, never evidence of cancellation. */ }
      return '/account/wallet?topup=' + state + '&topupId=' + encodeURIComponent(topupId);
    },
  };
}
