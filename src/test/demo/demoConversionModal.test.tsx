import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { DemoConversionModal } from '@/features/demo/components/DemoConversionModal';
import { DemoConversionProvider, useDemoConversion } from '@/features/demo/providers/DemoConversionProvider';

const OpenOnMount: React.FC = () => {
  const { open } = useDemoConversion();
  useEffect(() => { open('export'); }, [open]);
  return null;
};

describe('DemoConversionModal', () => {
  it('"Create account" is a real page load straight to registration', () => {
    // No router around it on purpose: it must not need one. A client-side
    // route change carried the fake demo user into the real app.
    render(
      <DemoConversionProvider>
        <OpenOnMount />
        <DemoConversionModal />
      </DemoConversionProvider>,
    );

    const link = screen.getByRole('link', { name: 'Create account' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/auth?intent=register&from=demo');
  });
});
