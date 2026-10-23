import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
const mocks = vi.hoisted(() => ({ upsertAddress: vi.fn(), deleteAddress: vi.fn(), setDefaultAddress: vi.fn(), updateProfile: vi.fn(), success: vi.fn(), error: vi.fn() }));
const user = { id: 'owner', firstName: 'Name', lastName: 'Last', email: '', phone: '+989110000001', createdAt: '2026-01-01', addresses: [{ id: 'first', label: 'home', recipient: 'Name', phone: '+989110000001', country: 'Iran', city: 'City', line1: 'Street', line2: '', postalCode: '123', isDefault: false }] };
vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user, ...mocks }) }));
vi.mock('@/components/account/AccountLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import Addresses from '@/pages/account/Addresses';
import PersonalInformation from '@/pages/account/PersonalInformation';
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe('account form persistence feedback', () => {
  it('keeps an address draft visible after a rejected save and avoids success feedback', async () => {
    mocks.upsertAddress.mockRejectedValue(Error('denied'));
    render(<Addresses />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit address' }));
    fireEvent.change(screen.getByLabelText('نام آدرس'), { target: { value: 'edited draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره آدرس' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('نام آدرس')).toHaveValue('edited draft');
    expect(screen.getByRole('button', { name: 'ذخیره آدرس' })).not.toBeDisabled();
  });
  it('catches failed deletes without reporting success', async () => {
    mocks.deleteAddress.mockRejectedValue(Error('denied'));
    render(<Addresses />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete address' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete address' })).not.toBeDisabled();
  });
  it('disables address actions during a default change and handles rejection', async () => {
    let reject!: (error: Error) => void;
    mocks.setDefaultAddress.mockReturnValue(new Promise((_, no) => { reject = no; }));
    render(<Addresses />);
    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }));
    expect(screen.getByRole('button', { name: 'Delete address' })).toBeDisabled();
    reject(Error('denied'));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Set as default' })).not.toBeDisabled();
  });
  it('retains profile form validation and avoids a write for invalid names', async () => {
    render(<PersonalInformation />);
    fireEvent.change(screen.getByLabelText('نام'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));
    expect(await screen.findByText('نام الزامی است.')).toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
