import { validateStatusBatch } from './productManagement';
export type ProductImageTarget = { id: string; expected: string[]; next: string[] };
export const imagesEqual = (a: unknown, b: unknown): boolean => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
export function existingImageList(value: unknown): string[] {
 if (!Array.isArray(value) || value.length > 50 || value.some(url => {
  if (typeof url !== 'string' || !url || url.length > 2048 || [...url].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return true;
  try { encodeURIComponent(url); const parsed = new URL(url, 'https://image-list.invalid'); return url.startsWith('/') ? url.startsWith('//') || parsed.origin !== 'https://image-list.invalid' : parsed.protocol !== 'https:' || !!parsed.username || !!parsed.password; } catch { return true; }
 })) throw Error('فهرست عکس‌های یکی از محصولات برای ویرایش گروهی معتبر نیست؛ آن محصول را جداگانه بررسی کنید.');
 return [...value];
}
export function validateImageBatch(targets: ProductImageTarget[]): ProductImageTarget[] {
 if (!Array.isArray(targets)) throw Error('انتخاب محصولات معتبر نیست.');
 validateStatusBatch(targets.map(target => ({ id: target.id, expectedActive: true })), true);
 return targets.map(target => {
  const expected = existingImageList(target.expected), next = existingImageList(target.next);
  if (expected.length && !next.length) throw Error('حذف آخرین عکس در ویرایش گروهی مجاز نیست.');
  const remaining = [...expected];
  for (const url of next) { const index = remaining.indexOf(url); if (index < 0) throw Error('فقط عکس‌های فعلی همان محصول قابل انتخاب هستند.'); remaining.splice(index, 1); }
  return { id: target.id, expected, next };
 });
}
