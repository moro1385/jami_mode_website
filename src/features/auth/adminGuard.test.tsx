import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ isAdmin: vi.fn(), bootstrap: vi.fn(), state: {} as Record<string, unknown> }));
vi.mock('./auth', () => ({ authService: { isAdmin: mocks.isAdmin } }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select(mocks.state) }));
import RequireAdmin from '@/components/auth/RequireAdmin';
function view() {
  return <MemoryRouter initialEntries={['/admin']}><Routes>
    <Route path="/admin" element={<RequireAdmin />}><Route index element={<div>protected-admin</div>} /></Route>
    <Route path="/" element={<div>public-home</div>} />
    <Route path="/signin" element={<div>sign-in</div>} />
  </Routes></MemoryRouter>;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = { user: { id: 'owner' }, session: { userId: 'owner', token: 'first', expiresAt: Date.now() + 60000 }, isBootstrapping: false, bootstrap: mocks.bootstrap };
});
afterEach(cleanup);
describe('admin guard after Auth feature extraction', () => {
  it('fails closed when the role request throws', async () => {
    mocks.isAdmin.mockRejectedValue(Error('offline'));
    render(view());
    expect(await screen.findByText('public-home')).toBeInTheDocument();
    expect(screen.queryByText('protected-admin')).not.toBeInTheDocument();
  });
  it('discards the previous token approval immediately and waits for the new check', async () => {
    let resolve!: (value: boolean) => void;
    mocks.isAdmin.mockResolvedValueOnce(true).mockReturnValueOnce(new Promise<boolean>(yes => { resolve = yes; }));
    const rendered = render(view());
    expect(await screen.findByText('protected-admin')).toBeInTheDocument();
    mocks.state.session = { userId: 'owner', token: 'second', expiresAt: Date.now() + 60000 };
    rendered.rerender(view());
    expect(screen.queryByText('protected-admin')).not.toBeInTheDocument();
    await act(async () => resolve(false));
    expect(await screen.findByText('public-home')).toBeInTheDocument();
  });
  it('ignores a late old-account approval after the new account is denied', async () => {
    let resolve!: (value: boolean) => void;
    mocks.isAdmin.mockReturnValueOnce(new Promise<boolean>(yes => { resolve = yes; })).mockResolvedValueOnce(false);
    const rendered = render(view());
    await waitFor(() => expect(mocks.isAdmin).toHaveBeenCalledWith('owner'));
    mocks.state.user = { id: 'other' };
    mocks.state.session = { userId: 'other', token: 'other-token', expiresAt: Date.now() + 60000 };
    rendered.rerender(view());
    expect(await screen.findByText('public-home')).toBeInTheDocument();
    await act(async () => resolve(true));
    expect(screen.queryByText('protected-admin')).not.toBeInTheDocument();
  });
  it('does not query a role for a signed-out visitor', async () => {
    mocks.state.user = null; mocks.state.session = null;
    render(view());
    expect(await screen.findByText('sign-in')).toBeInTheDocument();
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });
});
