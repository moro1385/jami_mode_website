import { useAuthStore } from '@/stores/authStore';
import { useCartSyncState } from './cartSyncState';
export function CartSyncNotice() {
 const ownerId = useAuthStore(state => state.user?.id), sync = useCartSyncState();
 if (!ownerId || sync.ownerId !== ownerId || !['offline', 'error'].includes(sync.status)) return null;
 return <div role="status" className="mb-6 border rounded-xl p-4 text-sm space-y-3">
  <p>{sync.unavailable ? 'همگام‌سازی هم‌زمان در این مرورگر در دسترس نیست؛ مرورگر را به‌روز کنید یا از مرورگر دیگری استفاده کنید.' : sync.status === 'offline' ? 'اتصال قطع است؛ تغییرات سبد هنوز با حساب شما همگام نشده‌اند.' : 'همگام‌سازی سبد انجام نشد؛ سبد فعلی حفظ شده است.'}</p>
  <p>تا تکمیل همگام‌سازی، تغییرات را در همین صفحه نگه دارید.</p>
  <button type="button" className="underline" disabled={sync.status === 'offline'} onClick={sync.retry}>بررسی دوبارهٔ همگام‌سازی</button>
 </div>;
}
