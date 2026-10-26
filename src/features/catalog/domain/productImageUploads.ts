import { existingImageList } from './productImageBatches';
import { validateStatusBatch } from './productManagement';
export type ProductImageUploadTarget = { id: string; expected: string[]; files: File[]; replaceLegacy: boolean };
export const IMAGE_UPLOAD_LIMITS = { perProduct: 5, files: 20, bytes: 40 * 1024 * 1024, fileBytes: 5 * 1024 * 1024 } as const;
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export function imageUploadExtension(file: File): string {
 const extension = extensions[file.type];
 if (!extension || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > IMAGE_UPLOAD_LIMITS.fileBytes) throw Error('فقط عکس JPEG، PNG یا WebP با حجم حداکثر ۵ مگابایت مجاز است.');
 return extension;
}
export async function validateImageUploadBatch(targets: ProductImageUploadTarget[]): Promise<ProductImageUploadTarget[]> {
 if (!Array.isArray(targets)) throw Error('انتخاب محصولات معتبر نیست.');
 validateStatusBatch(targets.map(target => ({ id: target.id, expectedActive: true })), true);
 let count = 0, bytes = 0;
 const queue = targets.map(target => {
  const expected = existingImageList(target.expected);
  if (!Array.isArray(target.files) || !target.files.length || target.files.length > IMAGE_UPLOAD_LIMITS.perProduct || expected.length + target.files.length > 50) throw Error('برای هر محصول ۱ تا ۵ عکس تازه و حداکثر ۵۰ عکس در مجموع انتخاب کنید.');
  if (!expected.length && target.replaceLegacy !== true) throw Error('جایگزینی گالری قدیمی باید صریحاً تأیید شود.');
  const files = [...target.files];
  files.forEach(file => { imageUploadExtension(file); count++; bytes += file.size; });
  return { id: target.id, expected, files, replaceLegacy: target.replaceLegacy === true };
 });
 if (count > IMAGE_UPLOAD_LIMITS.files || bytes > IMAGE_UPLOAD_LIMITS.bytes) throw Error('هر نوبت حداکثر ۲۰ فایل با مجموع حجم ۴۰ مگابایت است.');
 // This catches mismatched headers; server bucket policies remain the security boundary.
 for (const target of queue) for (const file of target.files) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (values: number[]) => values.every((value, index) => header[index] === value);
  const valid = file.type === 'image/jpeg' ? starts([255, 216, 255]) : file.type === 'image/png' ? starts([137, 80, 78, 71, 13, 10, 26, 10]) : header.length === 12 && starts([82, 73, 70, 70]) && [87, 69, 66, 80].every((value, index) => header[index + 8] === value);
  if (!valid) throw Error('محتوای یکی از فایل‌ها با نوع عکس آن سازگار نیست.');
 }
 return queue;
}
