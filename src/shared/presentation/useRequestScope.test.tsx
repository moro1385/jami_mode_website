import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRequestScope } from './useRequestScope';
describe('request scope lifetime', () => {
  it('never revives the first account after A to B to A', () => {
    const h = renderHook(({ id }) => useRequestScope(id), { initialProps: { id: 'A' } });
    const a = h.result.current(); expect(a()).toBe(true);
    h.rerender({ id: 'B' }); const b = h.result.current(); expect(a()).toBe(false); expect(b()).toBe(true);
    h.rerender({ id: 'A' }); expect(a()).toBe(false); expect(b()).toBe(false); expect(h.result.current()()).toBe(true);
  });
  it('invalidates outstanding work on unmount', () => {
    const h = renderHook(() => useRequestScope('A')); const current = h.result.current();
    h.unmount(); expect(current()).toBe(false);
  });
  it('supports the active StrictMode lifetime and rejects unsigned work', () => {
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const h = renderHook(({ id }: { id: string | undefined }) => useRequestScope(id), { initialProps: { id: undefined as string | undefined }, wrapper });
    expect(h.result.current()()).toBe(false);
    act(() => h.rerender({ id: 'A' })); expect(h.result.current()()).toBe(true);
  });
});
