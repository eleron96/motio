import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === 'string') return strings;
    return strings.reduce(
      (acc, str, index) => acc + str + (values[index] !== undefined ? String(values[index]) : ''),
      '',
    );
  },
  plural: (count: number, forms: { one: string; other: string }) =>
    (count === 1 ? forms.one : forms.other).replace('#', String(count)),
}));
import { ProfileSummary } from '@/features/auth/components/ProfileSummary';
import { EMPTY_PROFILE_SUMMARY, type ProfileSummaryData } from '@/features/auth/lib/profileSummary';

const summary = (overrides: Partial<ProfileSummaryData>): ProfileSummaryData => ({
  ...EMPTY_PROFILE_SUMMARY,
  hasData: true,
  completed: 85,
  completionRate: 61,
  active: 27,
  completedThisWeek: 7,
  projectCount: 15,
  weeklyCompleted: [5, 8, 6, 11, 9, 14, 4, 7],
  weekDelta: 3,
  bestWeek: 14,
  topProjects: [
    { id: 'p1', name: 'North', share: 38 },
    { id: 'p2', name: 'South', share: 21 },
    { id: 'p3', name: 'East', share: 12 },
  ],
  ...overrides,
});

describe('ProfileSummary', () => {
  it('shows the weekly bars, the delta and the top projects', () => {
    render(<ProfileSummary summary={summary({})} animate={false} />);

    expect(screen.getByText('Closed by week')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByLabelText('current week: 7')).toBeInTheDocument();
    expect(screen.getByLabelText('7 weeks ago: 5')).toBeInTheDocument();
    // the best week fills the row, the others scale to it
    expect(screen.getByLabelText('2 weeks ago: 14')).toHaveStyle({ height: '100%' });

    expect(screen.getByText('Where your tasks are')).toBeInTheDocument();
    expect(screen.getByText('North')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('and 12 more projects')).toBeInTheDocument();
    expect(screen.getByText('best week: 14')).toBeInTheDocument();
  });

  it('writes a drop with a real minus sign', () => {
    render(<ProfileSummary summary={summary({ weekDelta: -2 })} animate={false} />);
    expect(screen.getByText('−2')).toBeInTheDocument();
  });

  it('hides the bars when nothing was closed in the period, and the delta when it is zero', () => {
    render(
      <ProfileSummary
        summary={summary({ weeklyCompleted: [0, 0, 0, 0, 0, 0, 0, 0], weekDelta: 0, bestWeek: 0 })}
        animate={false}
      />,
    );
    expect(screen.queryByText('Closed by week')).not.toBeInTheDocument();
    expect(screen.queryByText(/best week/)).not.toBeInTheDocument();
    expect(screen.getByText('Where your tasks are')).toBeInTheDocument();
  });

  it('drops the "more projects" line when every project is listed', () => {
    render(<ProfileSummary summary={summary({ projectCount: 3 })} animate={false} />);
    expect(screen.queryByText(/more project/)).not.toBeInTheDocument();
  });
});
