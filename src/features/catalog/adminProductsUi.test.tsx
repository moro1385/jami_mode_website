import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminProducts from '@/pages/admin/AdminProducts';
import { ProductVariantsManager } from '@/components/admin/ProductVariantsManager';
import { adminProducts } from './admin';
import { toast } from 'sonner';

vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: 'synthetic-admin' } }) }));
vi.mock('@/features/catalog/admin', () => ({ adminProducts: {
  listProducts: vi.fn(), duplicateProduct: vi.fn(), changePrice: vi.fn(), deleteProduct: vi.fn(),
  listVariants: vi.fn(), updateVariantField: vi.fn(), addVariant: vi.fn(), deleteVariant: vi.fn(),
} }));
vi.mock('@/components/admin/ProductFormDialog', () => ({ ProductFormDialog: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('product-admin UI through the new service boundary', () => {
  it('retains the duplicate-slug message and does not show success on rejection', async () => {
    const product = { id: 'synthetic-product', name: 'Cotton Socks', slug: 'cotton-socks', price: 50000, is_active: true };
    vi.mocked(adminProducts.listProducts).mockResolvedValue([product as Awaited<ReturnType<typeof adminProducts.listProducts>>[number]]);
    vi.mocked(adminProducts.duplicateProduct).mockRejectedValue({ code: '23505', message: 'products_slug_key' });
    render(<AdminProducts />);
    fireEvent.click(await screen.findByTitle('کپی محصول'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('این نامک (Slug) قبلاً برای محصول دیگری استفاده شده — لطفاً کمی تغییرش بده.'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(adminProducts.listProducts).toHaveBeenCalledTimes(1);
  });

  it('keeps load failures distinct from an empty product list', async () => {
    vi.mocked(adminProducts.listProducts).mockRejectedValue(Error('synthetic outage'));
    render(<AdminProducts />);
    expect(await screen.findByText('بارگیری محصولات با شکست مواجه شد.')).toBeInTheDocument();
    expect(screen.queryByText('هیچ محصولی پیدا نشد. برای شروع یکی اضافه کنید.')).not.toBeInTheDocument();
  });

  it('reloads persisted variant values when an optimistic edit is rejected', async () => {
    const variant = { id: 'synthetic-variant', product_id: 'synthetic-product', created_at: '2026-10-01',
      size: 'M', color: 'black', sku: 'sku-1', price: 50000, stock_quantity: 2 };
    vi.mocked(adminProducts.listVariants).mockResolvedValue([variant]);
    vi.mocked(adminProducts.updateVariantField).mockRejectedValue({ code: '42501' });
    render(<ProductVariantsManager productId="synthetic-product" />);
    fireEvent.change(await screen.findByDisplayValue('M'), { target: { value: 'L' } });
    await waitFor(() => expect(adminProducts.listVariants).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue('M')).toBeInTheDocument();
    expect(adminProducts.updateVariantField).toHaveBeenCalledWith(variant.id, 'size', 'L');
  });
});
