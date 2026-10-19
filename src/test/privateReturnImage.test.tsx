import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sign: vi.fn(), user: 'owner' as string | undefined }));
vi.mock('@/lib/returnImages', () => ({ signedReturnImage: m.sign }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: m.user ? { id: m.user } : null }) }));
import PrivateReturnImage from '@/components/returns/PrivateReturnImage';
beforeEach(() => { vi.useFakeTimers(); m.sign.mockReset(); m.user = 'owner'; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
describe('private image lifecycle', () => {
 it('renders a safe signed link and replaces broken images with a fallback', async () => {
  m.sign.mockResolvedValue('/signed-one'); render(<PrivateReturnImage reference="path" alt="proof" openable />); await flush();
  const img = screen.getByRole('img'); expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(screen.getByRole('link').getAttribute('rel')).toBe('noopener noreferrer');
  fireEvent.error(img); expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByText('تصویر در دسترس نیست')).toBeTruthy();
 });
 it('drops the previous account image and rejects its delayed response after switching account', async () => {
  let late: (v: string) => void;
  m.sign.mockImplementationOnce(() => new Promise(resolve => { late = resolve; })).mockResolvedValueOnce(null);
  const view = render(<PrivateReturnImage reference="path" alt="proof" />);
  m.user = 'other'; view.rerender(<PrivateReturnImage reference="path" alt="proof" />); await flush();
  await act(async () => { late('/previous-account'); }); expect(screen.queryByRole('img')).toBeNull();
 });
 it('clears a displayed image on signout without requesting another signature', async () => {
  m.sign.mockResolvedValue('/signed'); const view = render(<PrivateReturnImage reference="path" alt="proof" />); await flush();
  expect(screen.getByRole('img')).toBeTruthy(); m.user = undefined;
  view.rerender(<PrivateReturnImage reference="path" alt="proof" />); await flush();
  expect(screen.queryByRole('img')).toBeNull(); expect(m.sign).toHaveBeenCalledTimes(1);
 });
 it('ignores a slower refresh after a newer signature has arrived', async () => {
  let late: (v: string) => void;
  m.sign.mockImplementationOnce(() => new Promise(resolve => { late = resolve; })).mockResolvedValueOnce('/newer');
  render(<PrivateReturnImage reference="path" alt="proof" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
  await act(async () => { late('/older'); }); expect(screen.getByRole('img').getAttribute('src')).toBe('/newer');
 });
 it('stops signing when unmounted and rejects a response for the previous reference', async () => {
  let late: (v: string) => void;
  m.sign.mockImplementationOnce(() => new Promise(resolve => { late = resolve; })).mockResolvedValueOnce('/current');
  const view = render(<PrivateReturnImage reference="old" alt="proof" />);
  view.rerender(<PrivateReturnImage reference="current" alt="proof" />); await flush();
  await act(async () => { late('/old'); }); expect(screen.getByRole('img').getAttribute('src')).toBe('/current');
  view.unmount(); await vi.advanceTimersByTimeAsync(90000); expect(m.sign).toHaveBeenCalledTimes(2);
 });
});
