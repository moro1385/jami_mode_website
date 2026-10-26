import type { ProductImageUploadJournal } from './productImageRecovery';
import { imageUploadExtension, validateImageUploadBatch, type ProductImageUploadTarget } from '../domain/productImageUploads';
import { existingImageList } from '../domain/productImageBatches';
import type { ProductBatchReport } from './productBatch';
import type { ProductImageBatchRepository } from './productImageBatchService';
export type ImageUploadAttempt = { productId: string; path: string; state: 'upload-unconfirmed' | 'uploaded-unlinked' | 'link-unconfirmed' | 'linked' };
export type ProductImageUploadReport = ProductBatchReport & { attempts: ImageUploadAttempt[]; recoveryWarning?: boolean };
export interface ProductImageUploadRepository extends ProductImageBatchRepository { verify(target: ProductImageUploadTarget): Promise<void> }
export interface ProductBatchImageStorage { upload(path: string, file: File): Promise<string> }
export function createProductImageUploadService(repository: ProductImageUploadRepository, storage: ProductBatchImageStorage, unique: () => string = () => crypto.randomUUID()) {
 return { async upload(targets: ProductImageUploadTarget[], current: () => boolean, journal?: ProductImageUploadJournal): Promise<ProductImageUploadReport> {
  const queue = await validateImageUploadBatch(targets);
  const report: ProductImageUploadReport = { succeeded: [], unchanged: [], failed: [], unattempted: [], attempts: [] };
  for (let index = 0; index < queue.length; index++) {
   const target = queue[index];
   if (!current()) { report.unattempted.push(...queue.slice(index).map(value => value.id)); break; }
   const attempts: ImageUploadAttempt[] = [], urls: string[] = [];
   try {
    await repository.verify(target);
    for (const file of target.files) {
     if (!current()) throw Error('Upload lifetime ended');
     const token = unique();
     if (!/^[a-f0-9-]{36}$/i.test(token)) throw Error('Invalid unique image key');
     const attempt: ImageUploadAttempt = { productId: target.id, path: target.id + '-' + token + '.' + imageUploadExtension(file), state: 'upload-unconfirmed' };
     journal?.record(attempt);
     attempts.push(attempt); report.attempts.push(attempt);
     const url = await storage.upload(attempt.path, file);
     attempt.state = 'uploaded-unlinked'; journal?.record(attempt);
     existingImageList([url]); urls.push(url);
    }
    if (!current()) throw Error('Upload lifetime ended');
    attempts.forEach(attempt => { attempt.state = 'link-unconfirmed'; journal?.record(attempt); });
    await repository.change({ id: target.id, expected: target.expected, next: [...target.expected, ...urls] });
    attempts.forEach(attempt => { attempt.state = 'linked'; });
    report.succeeded.push(target.id);
    try { journal?.forget(attempts.map(attempt => attempt.path)); } catch { report.recoveryWarning = true; }
   } catch {
    // A lost response can hide a successful upload or write. Never delete or retry automatically.
    report.failed.push(target.id); report.unattempted.push(...queue.slice(index + 1).map(value => value.id)); break;
   }
  }
  return report;
 } };
}
