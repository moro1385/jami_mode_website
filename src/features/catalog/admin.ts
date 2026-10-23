import { afterCatalogMutation } from './catalogChanges';
import { supabase } from '@/integrations/supabase/client';
import { createAdminProductsService } from './application/adminProductsService';
import { createSupabaseAdminProductsRepository } from './infrastructure/supabaseAdminProductsRepository';
import { createProductImagesService } from './application/productImagesService';
import { createSupabaseProductImagesRepository, createSupabaseProductImageStorage } from './infrastructure/supabaseProductImages';

// This uses the existing signed-in browser client. Database RLS remains authoritative.
const productRepository = createSupabaseAdminProductsRepository(supabase);
productRepository.insertProduct = afterCatalogMutation(productRepository.insertProduct);
productRepository.updateProduct = afterCatalogMutation(productRepository.updateProduct);
productRepository.deleteProduct = afterCatalogMutation(productRepository.deleteProduct);
productRepository.insertVariant = afterCatalogMutation(productRepository.insertVariant);
productRepository.updateVariant = afterCatalogMutation(productRepository.updateVariant);
productRepository.deleteVariant = afterCatalogMutation(productRepository.deleteVariant);
export const adminProducts = createAdminProductsService(productRepository);
const imageRepository = createSupabaseProductImagesRepository(supabase);
imageRepository.replace = afterCatalogMutation(imageRepository.replace);
export const adminProductImages = createProductImagesService(
  imageRepository, createSupabaseProductImageStorage(supabase),
);
export type { AdminProduct, AdminVariant } from './domain/adminProducts';
export type { AdminProductImage } from './application/productImagesRepository';
