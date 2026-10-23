import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createProductImagesService } from './application/productImagesService';
import type { ProductImageStorage, ProductImagesRepository } from './application/productImagesRepository';
import { createSupabaseProductImagesRepository, createSupabaseProductImageStorage } from './infrastructure/supabaseProductImages';

function ports() {
  const repository: ProductImagesRepository = { read: vi.fn().mockResolvedValue(['/old.jpg']), replace: vi.fn().mockResolvedValue(undefined) };
  const storage: ProductImageStorage = { upload: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) };
  return { repository, storage };
}

describe('product image use cases preserve sequencing and failures', () => {
  it('keeps existing image identity, ordering and nullable alt text', async () => {
    const { repository, storage } = ports();
    const images = await createProductImagesService(repository, storage, { now: () => 'synthetic-time' }).list('product-1');
    expect(images).toEqual([{ id: '/old.jpg', image_url: '/old.jpg', product_id: 'product-1',
      alt_text: null, sort_order: 0, created_at: 'synthetic-time' }]);
  });

  it('uploads sequentially, appends metadata once and retains previous image order', async () => {
    const { repository, storage } = ports(), events: string[] = [];
    vi.mocked(storage.upload).mockImplementation(async path => { events.push(path); return '/'+path; });
    vi.mocked(repository.replace).mockImplementation(async () => { events.push('metadata'); });
    const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);
    const oldUrls = ['/old.jpg'];
    const files = [new File(['a'], 'one.jpg'), new File(['b'], 'two.png')];
    const result = await createProductImagesService(repository, storage, { random, now: () => 'synthetic-time' }).upload('product-1', files, oldUrls);
    expect(events).toEqual(['product-1-0.1.jpg', 'product-1-0.2.png', 'metadata']);
    expect(repository.replace).toHaveBeenCalledWith('product-1', ['/old.jpg', '/product-1-0.1.jpg', '/product-1-0.2.png']);
    expect(result.map(image => [image.image_url, image.sort_order])).toEqual([['/product-1-0.1.jpg', 1], ['/product-1-0.2.png', 2]]);
    expect(oldUrls).toEqual(['/old.jpg']);
  });

  it('does not replace metadata or silently delete files after a partial upload failure', async () => {
    const { repository, storage } = ports(), failure = Error('synthetic upload rejection');
    vi.mocked(storage.upload).mockResolvedValueOnce('/uploaded.jpg').mockRejectedValueOnce(failure);
    const service = createProductImagesService(repository, storage);
    await expect(service.upload('product-1', [new File(['a'], 'one.jpg'), new File(['b'], 'two.jpg')], ['/old.jpg'])).rejects.toBe(failure);
    expect(repository.replace).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('does not report success when metadata persistence fails', async () => {
    const { repository, storage } = ports(), failure = { code: '42501' };
    vi.mocked(storage.upload).mockResolvedValue('/new.jpg');
    vi.mocked(repository.replace).mockRejectedValue(failure);
    await expect(createProductImagesService(repository, storage).upload('product-1', [new File(['a'], 'one.jpg')], ['/old.jpg'])).rejects.toBe(failure);
  });

  it('separates metadata removal from best-effort storage cleanup', async () => {
    const { repository, storage } = ports(), service = createProductImagesService(repository, storage);
    await service.removeReference('product-1', '/old.jpg', ['/old.jpg', '/kept.jpg']);
    expect(repository.replace).toHaveBeenCalledWith('product-1', ['/kept.jpg']);
    expect(storage.remove).not.toHaveBeenCalled();
    await service.removeFile('https://synthetic.invalid/storage/v1/object/public/product-images/old.jpg');
    expect(storage.remove).toHaveBeenCalledWith('old.jpg');
  });
});

describe('product image adapter keeps the existing bucket and permissions', () => {
  it('reads only the selected product images and scopes metadata updates by id', async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { images: null }, error: null }),
      then: (resolve: (result: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    const from = vi.fn().mockReturnValue(query);
    const repository = createSupabaseProductImagesRepository({ from } as unknown as Pick<SupabaseClient<Database>, 'from'>);
    expect(await repository.read('product-1')).toEqual([]);
    await repository.replace('product-1', ['/kept.jpg']);
    expect(from.mock.calls).toEqual([['products'], ['products']]);
    expect(query.select).toHaveBeenCalledWith('images');
    expect(query.eq.mock.calls).toEqual([['id', 'product-1'], ['id', 'product-1']]);
    expect(query.update).toHaveBeenCalledWith({ images: ['/kept.jpg'] });
  });

  it('does not request a public URL after a rejected upload', async () => {
    const failure = { code: '42501' };
    const bucket = { upload: vi.fn().mockResolvedValue({ error: failure }), getPublicUrl: vi.fn(), remove: vi.fn() };
    const from = vi.fn().mockReturnValue(bucket);
    const storage = createSupabaseProductImageStorage({ storage: { from } } as unknown as Pick<SupabaseClient<Database>, 'storage'>);
    await expect(storage.upload('synthetic.jpg', new File(['a'], 'a.jpg'))).rejects.toBe(failure);
    expect(from).toHaveBeenCalledWith('product-images');
    expect(bucket.getPublicUrl).not.toHaveBeenCalled();
  });

  it('retains the bucket upload/public-url contract and best-effort returned cleanup errors', async () => {
    const bucket = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://synthetic.invalid/new.jpg' } }),
      remove: vi.fn().mockResolvedValue({ error: { code: 'SYNTHETIC_CLEANUP_FAILURE' } }),
    };
    const from = vi.fn().mockReturnValue(bucket);
    const storage = createSupabaseProductImageStorage({ storage: { from } } as unknown as Pick<SupabaseClient<Database>, 'storage'>);
    const file = new File(['a'], 'a.jpg');
    expect(await storage.upload('synthetic.jpg', file)).toBe('https://synthetic.invalid/new.jpg');
    expect(bucket.upload).toHaveBeenCalledWith('synthetic.jpg', file);
    await expect(storage.remove('synthetic.jpg')).resolves.toBeUndefined();
    expect(bucket.remove).toHaveBeenCalledWith(['synthetic.jpg']);
  });
});

it('does not continue a stale multi-file upload or persist metadata under a new form lifetime', async () => {
 const { repository, storage } = ports(); let active = true;
 vi.mocked(storage.upload).mockImplementationOnce(async () => { active = false; return '/first.jpg'; });
 const service = createProductImagesService(repository, storage);
 await expect(service.upload('product', [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')], [], () => active)).rejects.toThrow('no longer active');
 expect(storage.upload).toHaveBeenCalledTimes(1); expect(repository.replace).not.toHaveBeenCalled(); expect(storage.remove).not.toHaveBeenCalled();
});
it('refuses a closed upload before sending any request, including a one-file metadata continuation', async () => {
 const { repository, storage } = ports(), service = createProductImagesService(repository, storage);
 await expect(service.upload('product', [new File(['a'], 'a.jpg')], [], () => false)).rejects.toThrow('no longer active');
 expect(storage.upload).not.toHaveBeenCalled(); expect(repository.replace).not.toHaveBeenCalled();
 let active = true; vi.mocked(storage.upload).mockImplementationOnce(async () => { active = false; return '/one.jpg'; });
 await expect(service.upload('product', [new File(['a'], 'a.jpg')], [], () => active)).rejects.toThrow('no longer active');
 expect(repository.replace).not.toHaveBeenCalled();
});
