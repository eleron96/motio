import { describe, expect, it } from 'vitest';
import { cn, cnWithUiSizes, UI_FONT_SIZES } from '@/shared/lib/classNames';
import tailwindConfig from '../../../tailwind.config';

describe('classNames', () => {
  it('keeps a ui font size and a text colour together', () => {
    expect(cnWithUiSizes('px-2.5 text-ui-xs text-primary-foreground')).toBe('px-2.5 text-ui-xs text-primary-foreground');
    expect(cnWithUiSizes('bg-primary text-primary-foreground text-ui-xs text-[10px]')).toBe('bg-primary text-primary-foreground text-[10px]');
  });

  it('still lets a later ui size override an earlier one', () => {
    expect(cnWithUiSizes('text-ui-xs text-ui-sm')).toBe('text-ui-sm');
  });

  it('leaves plain cn as it was (a separate decision)', () => {
    expect(cn('text-ui-xs text-primary')).toBe('text-primary');
  });

  it('lists exactly the font sizes tailwind.config defines', () => {
    const sizes = Object.keys((tailwindConfig as { theme: { extend: { fontSize: Record<string, unknown> } } }).theme.extend.fontSize);
    expect([...UI_FONT_SIZES].sort()).toEqual([...sizes].sort());
  });
});
