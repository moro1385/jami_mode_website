import type { ImageRecoveryEntry, ImageRecoveryJournal } from '../application/productImageRecovery';
import type { ImageUploadAttempt } from '../application/productImageUploadService';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const states = ['upload-unconfirmed', 'uploaded-unlinked', 'link-unconfirmed', 'linked'];
export const MAX_IMAGE_RECOVERY_ENTRIES = 200;
type JournalStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export function validImageRecoveryAttempt(value: unknown): value is ImageUploadAttempt {
 if (!value || typeof value !== 'object') return false;
 const item = value as ImageUploadAttempt;
 if (!uuid.test(item.productId) || typeof item.path !== 'string' || !states.includes(item.state)) return false;
 const suffix = item.path.slice(item.productId.length + 1), dot = suffix.lastIndexOf('.');
 return item.path.startsWith(item.productId + '-') && uuid.test(suffix.slice(0, dot)) && ['png', 'jpg', 'webp'].includes(suffix.slice(dot + 1));
}
export function createBrowserImageRecoveryJournal(ownerId: string, storage: JournalStorage, now = () => Date.now(), namespace = 'jami-product-images-v1'): ImageRecoveryJournal {
 if (!uuid.test(ownerId) || !/^[a-z0-9-]{1,90}$/i.test(namespace)) throw Error('حساب یا فضای گزارش بازیابی معتبر نیست.');
 const prefix = namespace + ':' + ownerId.toLowerCase() + ':';
 function list(): ImageRecoveryEntry[] {
  if (storage.length > 10_000) throw Error('تعداد یادداشت‌های مرورگر بیش از حد است.');
  const values: ImageRecoveryEntry[] = [];
  for (let index = 0; index < storage.length; index++) {
   const key = storage.key(index); if (!key?.startsWith(prefix)) continue;
   const raw = storage.getItem(key); if (raw === null) continue;
   if (raw.length > 1024) throw Error('یادداشت بازیابی آسیب دیده است؛ دادهٔ قبلی حفظ شد.');
   const item = JSON.parse(raw) as ImageRecoveryEntry & { version: number };
   if (item.version !== 1 || !validImageRecoveryAttempt(item) || key !== prefix + item.path || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0) throw Error('یادداشت بازیابی معتبر نیست؛ دادهٔ قبلی حفظ شد.');
   values.push({ productId: item.productId, path: item.path, state: item.state, updatedAt: item.updatedAt });
   if (values.length > 1000) throw Error('گزارش بازیابی پر است؛ ابتدا یادداشت‌های قبلی را بررسی کنید.');
  }
  return values.sort((a,b) => b.updatedAt-a.updatedAt || a.path.localeCompare(b.path));
 }
 return { list, record(attempt) {
  if (!validImageRecoveryAttempt(attempt)) throw Error('مسیر گزارش بازیابی معتبر نیست.');
  const values = list();
  if (values.length >= MAX_IMAGE_RECOVERY_ENTRIES && !values.some(item => item.path === attempt.path)) throw Error('گزارش بازیابی پر است؛ ابتدا موارد قبلی را بررسی کنید.');
  const value = { version: 1, productId: attempt.productId, path: attempt.path, state: attempt.state, updatedAt: now() };
  const serialized = JSON.stringify(value); storage.setItem(prefix + attempt.path, serialized);
  if (storage.getItem(prefix + attempt.path) !== serialized) throw Error('ذخیرهٔ گزارش بازیابی تأیید نشد.');
 }, forget(paths) {
  const owned = list();
  if (paths.some(path => !owned.some(item => item.path === path))) throw Error('یادداشت بازیابی پیدا نشد.');
  paths.forEach(path => { storage.removeItem(prefix + path); if (storage.getItem(prefix + path) !== null) throw Error('بستن یادداشت بازیابی تأیید نشد.'); });
 } };
}
