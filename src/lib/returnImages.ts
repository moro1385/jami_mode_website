import { supabase } from '@/integrations/supabase/client';
import { publicSupabaseConfig } from '../../config/supabase-public.js';
export const RETURN_BUCKET = 'return-request-images';
const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export function returnImagePath(reference: string): string | null {
  let path = reference;
  if (/^https?:/i.test(reference)) {
    try {
      const url = new URL(reference), base = publicSupabaseConfig(import.meta.env).url;
      const prefix = '/storage/v1/object/public/' + RETURN_BUCKET + '/';
      if (url.origin !== base || !url.pathname.startsWith(prefix) || url.search || url.hash) return null;
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch { return null; }
  }
  // Legacy filenames were random decimal strings; no traversal, encoded segments or remote URLs.
  return /^[0-9a-f-]{36}\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(path) && !path.includes('..') ? path : null;
}
export function validateReturnImage(file: File) {
  if (!mimeExtensions[file.type] || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('تصویر باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد.');
  return mimeExtensions[file.type];
}
export async function uploadReturnImages(userId: string, files: File[]): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/i.test(userId) || files.length > 5) throw new Error('Invalid image request');
  files.forEach(validateReturnImage);
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const path = userId + '/' + crypto.randomUUID() + '.' + validateReturnImage(file);
      const { error } = await supabase.storage.from(RETURN_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw new Error('خطا در آپلود تصاویر');
      uploaded.push(path);
    }
    return uploaded;
  } catch (error) { await cleanupReturnImages(uploaded); throw error; }
}
export async function cleanupReturnImages(paths: string[]) {
  if (paths.length) try { await supabase.storage.from(RETURN_BUCKET).remove(paths); } catch { /* Best effort; operator can prune orphan objects. */ }
}
export async function signedReturnImage(reference: string): Promise<string | null> {
  const path = returnImagePath(reference);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(RETURN_BUCKET).createSignedUrl(path, 60);
  return error ? null : data?.signedUrl || null;
}
