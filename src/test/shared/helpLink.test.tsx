import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpLink } from '@/shared/ui/help-link';
import { useLocaleStore } from '@/shared/store/localeStore';

// Translations are covered by src/test/smoke/localeCatalogs.test.ts.
vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

describe('HelpLink', () => {
  // Reset before rendering: changing it while the link is mounted re-renders it.
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en');
  });

  it('opens the English user guide in a new tab', () => {
    render(<HelpLink />);
    const link = screen.getByRole('link', { name: 'Help' });
    expect(link).toHaveAttribute('href', 'https://eleron96.github.io/motio/guide/');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens the Russian user guide for the Russian interface', () => {
    useLocaleStore.getState().setLocale('ru');
    render(<HelpLink />);
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', 'https://eleron96.github.io/motio/ru/guide/');
  });
});
