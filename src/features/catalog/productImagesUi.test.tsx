import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductImagesManager } from '@/components/admin/ProductImagesManager';
import { adminProductImages } from './admin';
import { toast } from 'sonner';

vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: 'synthetic-admin' } }) }));
vi.mock('@/features/catalog/admin', () => ({ adminProductImages: {
  list: vi.fn(), upload: vi.fn(), removeReference: vi.fn(), removeFile: vi.fn(),
} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const old = { id: 'https://synthetic.invalid/old.jpg', image_url: 'https://synthetic.invalid/old.jpg',
  product_id: 'product-1', alt_text: null, sort_order: 0, created_at: '2026-10-01' };
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(adminProductImages.list).mockResolvedValue([old]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('image UI after removing direct storage access', () => {
  it('retains previous images when upload/persistence fails', async () => {
    vi.mocked(adminProductImages.upload).mockRejectedValue(Error('synthetic upload failure'));
    const { container } = render(<ProductImagesManager productId="product-1" />);
    await screen.findByAltText('Product image');
    fireEvent.change(container.querySelector('#image-upload')!, { target: { files: [new File(['a'], 'a.jpg')] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('synthetic upload failure'));
    expect(screen.getByAltText('Product image')).toHaveAttribute('src', old.image_url);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('preserves successful metadata removal when later storage cleanup fails', async () => {
    vi.mocked(adminProductImages.removeReference).mockResolvedValue(undefined);
    vi.mocked(adminProductImages.removeFile).mockRejectedValue(Error('synthetic cleanup failure'));
    const { container } = render(<ProductImagesManager productId="product-1" />);
    await screen.findByAltText('Product image');
    const deleteButton = container.querySelector('.grid button');
    expect(deleteButton).not.toBeNull();
    fireEvent.click(deleteButton!);
    await waitFor(() => expect(adminProductImages.removeFile).toHaveBeenCalledWith(old.image_url));
    expect(toast.success).toHaveBeenCalledWith('تصویر حذف شد');
    expect(screen.queryByAltText('Product image')).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
