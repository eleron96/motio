import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

import { MobileCalendarLegendScreen } from '@/features/planner/components/timeline/MobileCalendarLegendScreen';
import type { CalendarOverlayVisibility } from '@/features/planner/lib/calendarDayMarkers';
import type { Assignee } from '@/features/planner/types/planner';

const PEOPLE = [
  { id: 'a1', name: 'Anna', isActive: true },
  { id: 'a2', name: 'Boris', isActive: true },
] as Assignee[];

/** Enough names to cross the threshold that earns the list a search box. */
const MANY_PEOPLE = Array.from({ length: 12 }, (_, index) => ({
  id: `p${index}`,
  name: `Person ${index}`,
  isActive: true,
})) as Assignee[];

const Harness: React.FC<{
  initial?: CalendarOverlayVisibility;
  showTimeOffRow?: boolean;
  people?: Assignee[];
  unknownPeopleIds?: string[];
  hiddenPeopleCount?: number;
}> = ({
  initial = { holidays: true, milestones: true, timeOff: false },
  showTimeOffRow = true,
  people = PEOPLE,
  unknownPeopleIds = [],
  hiddenPeopleCount = 0,
}) => {
  const [visibility, setVisibility] = React.useState(initial);
  const [selectedPeople, setSelectedPeople] = React.useState<string[] | null>(null);
  const allIds = [...people.map((person) => person.id), ...unknownPeopleIds];

  return (
    <MobileCalendarLegendScreen
      open
      onOpenChange={() => {}}
      visibility={visibility}
      onToggle={(category) => setVisibility((current) => ({
        ...current,
        [category]: !current[category],
      }))}
      showTimeOffRow={showTimeOffRow}
      people={people}
      unknownPeopleIds={unknownPeopleIds}
      hiddenPeopleCount={hiddenPeopleCount}
      onToggleUnknownPeople={() => setSelectedPeople((current) => {
        const base = current ?? allIds;
        return unknownPeopleIds.every((id) => base.includes(id))
          ? base.filter((id) => !unknownPeopleIds.includes(id))
          : [...base, ...unknownPeopleIds];
      })}
      selectedPeople={selectedPeople}
      onTogglePerson={(id) => setSelectedPeople((current) => {
        const base = current ?? allIds;
        return base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
      })}
      onShowAllPeople={() => setSelectedPeople(null)}
      onShowOnlyMe={() => setSelectedPeople(['a1'])}
      myAssigneeId="a1"
    />
  );
};

describe('Calendar legend on a phone', () => {
  it('explains every mark and switches its layer', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const legend = screen.getByRole('dialog', { name: 'On the calendar' });
    expect(legend).toBeInTheDocument();
    // The legend is the explanation too, not just switches.
    expect(screen.getByText('Deliveries, coloured by project.')).toBeInTheDocument();

    expect(screen.getByRole('switch', { name: 'Holidays' })).toBeChecked();
    await user.click(screen.getByRole('switch', { name: 'Holidays' }));
    expect(screen.getByRole('switch', { name: 'Holidays' })).not.toBeChecked();

    expect(screen.getByRole('switch', { name: 'Milestones' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Team time off' })).not.toBeChecked();
  });

  it('reveals the people filter only once time off is on', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByText('Anna')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Team time off' }));

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Anna' }));
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Boris' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('gets back to everyone from a partial selection', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ holidays: true, milestones: true, timeOff: true }} />);

    await user.click(screen.getByRole('button', { name: 'Boris' }));
    expect(screen.getByText('1/2')).toBeInTheDocument();

    // "Only me" and "All" are the only way out of a partial filter on a phone —
    // the desktop's click-the-avatar shortcut has no touch equivalent.
    await user.click(screen.getByRole('button', { name: 'Only me' }));
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Boris' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Boris' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('filters a long list by name, and hides the "not on the team" row while searching', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{ holidays: true, milestones: true, timeOff: true }}
        people={MANY_PEOPLE}
        unknownPeopleIds={['ghost']}
      />,
    );

    expect(screen.getByText('Not on the team (1)')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Find a person'), 'Person 11');

    expect(screen.getByRole('button', { name: 'Person 11' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Person 1' })).not.toBeInTheDocument();
    // The unknown row is not a search result, so it steps aside while filtering.
    expect(screen.queryByText('Not on the team (1)')).not.toBeInTheDocument();
  });

  it('does not claim the list is empty while the "not on the team" row is on it', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{ holidays: true, milestones: true, timeOff: true }}
        people={[]}
        unknownPeopleIds={['ghost']}
        hiddenPeopleCount={3}
      />,
    );

    expect(screen.getByText('Not on the team (1)')).toBeInTheDocument();
    expect(screen.queryByText('Nobody found')).not.toBeInTheDocument();
    expect(screen.getByText('Others are not away in this range (3)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Not on the team (1)' }));
    expect(screen.getByRole('button', { name: 'Not on the team (1)' }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('omits the time-off row where the feature is off', () => {
    render(<Harness showTimeOffRow={false} />);

    expect(screen.getByRole('switch', { name: 'Holidays' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Team time off' })).not.toBeInTheDocument();
  });
});
