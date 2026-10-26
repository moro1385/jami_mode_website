import type { ImageUploadAttempt } from './productImageUploadService';
export type ImageRecoveryEntry = ImageUploadAttempt & { updatedAt: number };
export interface ProductImageUploadJournal {
 record(attempt: ImageUploadAttempt): void;
 forget(paths: string[]): void;
}
export interface ImageRecoveryJournal extends ProductImageUploadJournal { list(): ImageRecoveryEntry[] }
export type ProductGallerySnapshot = { id: string; main: string[]; legacy: Array<{ id: string; url: string; order: number }> };
export interface ProductImageGalleryReader { read(id: string): Promise<ProductGallerySnapshot> }
