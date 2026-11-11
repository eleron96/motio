import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { addDays } from 'date-fns';
import { TimelineHeader } from '@/features/planner/components/timeline/TimelineHeader';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const auth = vi.hoisted(() => ({
  state: { profilePreferences: {} as Record<string, unknown> | null },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(auth.state),
}));

// Monday 9 November 2026 (week 46) through Monday 23 November (week 48).
const FIRST = new Date(2026, 10, 9);
const DAYS = Array.from({ length: 15 }, (_, index) => addDays(FIRST, index));

const renderHeader = (viewMode: 'day' | 'week' = 'day') => render(
  <TimelineHeader
    visibleDays={DAYS}
    dayWidth={viewMode === 'day' ? 120 : 48}
    viewMode={viewMode}
    attentionDate={null}
    todayKey="2026-11-11"
    holidayDates={new Set<string>()}
  />,
);

const labels = (container: HTMLElement) => (
  Array.from(container.querySelectorAll('[data-week-number]')).map((node) => node.textContent)
);

describe('TimelineHeader week numbers', () => {
  beforeEach(() => {
    auth.state.profilePreferences = {};
  });

  it('shows none unless the person turned them on', () => {
    const { container } = renderHeader();
    expect(labels(container)).toEqual([]);
  });

  it('labels each Monday with its week once the preference is on', () => {
    auth.state.profilePreferences = { week_numbers_enabled: true };
    const { container } = renderHeader();
    expect(labels(container)).toEqual(['CW 46', 'CW 47', 'CW 48']);
    const monday = container.querySelector('[data-day-key="2026-11-16"]');
    expect(monday?.querySelector('[data-week-number]')?.textContent).toBe('CW 47');
    expect(container.querySelector('[data-day-key="2026-11-17"] [data-week-number]')).toBeNull();
  });

  it('labels the narrow Week view the same way', () => {
    auth.state.profilePreferences = { week_numbers_enabled: true };
    const { container } = renderHeader('week');
    expect(labels(container)).toEqual(['CW 46', 'CW 47', 'CW 48']);
  });
});
