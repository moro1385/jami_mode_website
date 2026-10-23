export interface ProductImagesRepository {
  read(productId: string): Promise<string[]>;
  replace(productId: string, urls: string[]): Promise<void>;
}

export interface ProductImageStorage {
  upload(path: string, file: File): Promise<string>;
  remove(filename: string): Promise<void>;
}

export interface AdminProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}
