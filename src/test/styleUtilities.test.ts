import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('Tailwind v4 component style overrides', () => {
  it('keeps consumer padding and responsive overrides on shared buttons', () => {
    expect(cn('px-4 py-2 md:px-6', 'px-8 md:px-10')).toBe('py-2 px-8 md:px-10');
  });
  it('merges migrated shadow sizes without removing shadow color', () => {
    expect(cn('shadow-xs shadow-black/10', 'shadow-lg')).toBe('shadow-black/10 shadow-lg');
  });
  it('retains independent ring color, width and offset on keyboard focus', () => {
    expect(cn('focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', 'focus-visible:ring-4'))
      .toBe('focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-4');
  });
  it('overrides CSS variable dimensions while preserving independent colors', () => {
    expect(cn('w-(--sidebar-width) bg-sidebar', 'w-64')).toBe('bg-sidebar w-64');
    expect(cn('bg-(--color-bg) border-(--color-border)', 'bg-card')).toBe('border-(--color-border) bg-card');
  });
});
