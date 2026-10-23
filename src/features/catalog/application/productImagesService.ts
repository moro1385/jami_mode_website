import type { AdminProductImage, ProductImagesRepository, ProductImageStorage } from './productImagesRepository';

export function createProductImagesService(repository: ProductImagesRepository, storage: ProductImageStorage,
  { random = Math.random, now = () => new Date().toISOString() } = {}) {
  function views(productId: string, urls: string[], offset = 0): AdminProductImage[] {
    return urls.map((url, index) => ({ id: url, product_id: productId, image_url: url,
      sort_order: offset + index, alt_text: null, created_at: now() }));
  }
  return {
    async list(productId: string) {
      return views(productId, await repository.read(productId));
    },
    async upload(productId: string, files: File[], currentUrls: string[], isCurrent: () => boolean = () => true) {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        if (!isCurrent()) throw Error("Image request no longer active");
        const extension = file.name.split('.').pop();
        uploadedUrls.push(await storage.upload(`${productId}-${random()}.${extension}`, file));
      }
      // Preserve the current ordering and failure behavior. Cleanup/validation policy is Phase 2 work.
      if (!isCurrent()) throw Error("Image request no longer active");
      await repository.replace(productId, [...currentUrls, ...uploadedUrls]);
      return views(productId, uploadedUrls, currentUrls.length);
    },
    async removeReference(productId: string, imageUrl: string, currentUrls: string[]) {
      await repository.replace(productId, currentUrls.filter(url => url !== imageUrl));
    },
    async removeFile(imageUrl: string) {
      const filename = new URL(imageUrl).pathname.split('/').pop();
      if (filename) await storage.remove(filename);
    },
  };
}
