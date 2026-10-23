import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminTickets from '@/pages/admin/AdminTickets';
import AdminUsers from '@/pages/admin/AdminUsers';
import Contact from '@/pages/Contact';
import { adminSupport } from './admin';
import { contactSupport } from './contact';
import { adminCustomers } from '@/features/customers/admin';
import { toast } from 'sonner';

const contactToast = vi.hoisted(() => vi.fn());
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: 'synthetic-admin' } }) }));
vi.mock('@/features/support/admin', () => ({ adminSupport: { listTickets: vi.fn(), toggleTicket: vi.fn() } }));
vi.mock('@/features/support/contact', () => ({ contactSupport: { submit: vi.fn() } }));
vi.mock('@/features/customers/admin', () => ({ adminCustomers: { list: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: contactToast }) }));
vi.mock('@/components/SEO', () => ({ default: () => null }));
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('support UI keeps failures separate from success', () => {
  it('keeps the pending ticket when the status update is denied', async () => {
    vi.mocked(adminSupport.listTickets).mockResolvedValue([{ id: 'ticket-A', first_name: 'A', last_name: 'B',
      email: null, subject: 'Synthetic', message: 'Body', status: 'pending', created_at: '2026-10-01' }]);
    vi.mocked(adminSupport.toggleTicket).mockRejectedValue({ code: '42501' });
    render(<AdminTickets />);
    fireEvent.click(await screen.findByRole('button', { name: 'تغییر به پاسخ داده شده' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('خطا در تغییر وضعیت تیکت'));
    expect(screen.getByText('در انتظار بررسی')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('retains a user-load error instead of presenting an empty user database', async () => {
    vi.mocked(adminCustomers.list).mockRejectedValue(Error('synthetic user outage'));
    render(<AdminUsers />);
    expect(await screen.findByRole('alert')).toHaveTextContent('بارگیری کاربران با شکست مواجه شد.');
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeEnabled();
    expect(screen.queryByText('هیچ کاربری پیدا نشد.')).not.toBeInTheDocument();
  });

  it('restores contact submission after a transport rejection and preserves the draft for retry', async () => {
    vi.mocked(contactSupport.submit).mockRejectedValueOnce(Error('synthetic transport failure')).mockResolvedValueOnce(undefined);
    const { container } = render(<Contact />);
    for (const [id, value] of Object.entries({ firstName: 'A', lastName: 'B', subject: 'Topic', message: 'Body' })) {
      fireEvent.change(container.querySelector('#'+id)!, { target: { value } });
    }
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    await waitFor(() => expect(contactToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'خطا در ارسال پیام', variant: 'destructive' })));
    expect(container.querySelector('#subject')).toHaveValue('Topic');
    expect(screen.getByRole('button', { name: 'ارسال پیام' })).not.toBeDisabled();
    fireEvent.submit(form);
    await waitFor(() => expect(contactToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'پیام شما ارسال شد!' })));
    expect(container.querySelector('#subject')).toHaveValue('');
    expect(contactSupport.submit).toHaveBeenCalledTimes(2);
  });
});
