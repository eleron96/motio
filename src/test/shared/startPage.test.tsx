import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MOTIO_SOURCE_URL, opensAppAtRoot } from '@/shared/lib/startPage';
import { SourceCodeLink } from '@/shared/ui/source-code-link';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

describe('opensAppAtRoot', () => {
  it('keeps the landing page unless the install asks for the app', () => {
    expect(opensAppAtRoot(undefined)).toBe(false);
    expect(opensAppAtRoot('')).toBe(false);
    expect(opensAppAtRoot('landing')).toBe(false);
    expect(opensAppAtRoot('/app')).toBe(false);
    expect(opensAppAtRoot('app')).toBe(true);
    expect(opensAppAtRoot(' APP ')).toBe(true);
  });
});

describe('SourceCodeLink', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays hidden while the landing page carries the link', () => {
    vi.stubEnv('VITE_START_PAGE', 'landing');
    const { container } = render(<SourceCodeLink />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links to the source when the landing page is off', () => {
    vi.stubEnv('VITE_START_PAGE', 'app');
    render(<SourceCodeLink />);
    expect(screen.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', MOTIO_SOURCE_URL);
  });
});
