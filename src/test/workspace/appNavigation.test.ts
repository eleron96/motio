import { describe, expect, it, vi } from 'vitest';
import { getAppNavigationLabel } from '@/features/workspace/lib/appNavigation';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

describe('appNavigation', () => {
  it('maps /app/members to Team label', () => {
    expect(getAppNavigationLabel('/app/members')).toBe('Team');
  });
});
