import React from 'react';
import { Check } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { Switch } from '@/shared/ui/switch';
import { SearchInput } from '@/shared/ui/SearchInput';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { getPersonMonogram } from '@/shared/domain/personName';
import { isPersonShown } from '@/features/planner/lib/calendarDayMarkers';
import { buildCalendarLegendRows } from '@/features/planner/components/timeline/calendarLegendRows';
import { resolveTimeOffColor } from '@/features/planner/lib/timeOffPalette';
import type { CalendarLegendPanelProps } from '@/features/planner/components/timeline/CalendarLegendPanel';

interface MobileCalendarLegendScreenProps extends Omit<CalendarLegendPanelProps, 'className'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Above this many people the list gets a filter box. */
const SEARCH_THRESHOLD = 10;

const PersonCheck: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px]',
      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
    )}
  >
    {checked && <Check className="h-4 w-4" />}
  </span>
);

/**
 * The calendar legend on a phone: what every mark means, and a switch per layer.
 *
 * The desktop legend is a 256px column pinned beside the grid — on a phone that
 * column has nowhere to go, so the calendar shipped with no legend at all and no
 * way to turn holidays, milestones or time off on. Same state, same wording,
 * shown as a screen you open from the calendar and swipe away.
 */
export const MobileCalendarLegendScreen: React.FC<MobileCalendarLegendScreenProps> = ({
  open,
  onOpenChange,
  visibility,
  onToggle,
  showTimeOffRow = false,
  people = [],
  peopleColors,
  selectedPeople = null,
  onTogglePerson,
  unknownPeopleIds = [],
  onToggleUnknownPeople,
  hiddenPeopleCount = 0,
  onShowAllPeople,
  onShowOnlyMe,
  myAssigneeId = null,
}) => {
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const rows = buildCalendarLegendRows(showTimeOffRow);
  const searchable = people.length > SEARCH_THRESHOLD;
  const visiblePeople = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => person.name.toLowerCase().includes(needle));
  }, [people, query]);

  const unknownShown = selectedPeople === null
    || unknownPeopleIds.every((id) => selectedPeople.includes(id));
  const totalCount = people.length + (unknownPeopleIds.length > 0 ? 1 : 0);
  const shownCount = selectedPeople === null
    ? totalCount
    : people.filter((person) => selectedPeople.includes(person.id)).length
      + (unknownPeopleIds.length > 0 && unknownShown ? 1 : 0);

  const showUnknownRow = unknownPeopleIds.length > 0
    && !query.trim()
    && Boolean(onToggleUnknownPeople);

  const showPeople = showTimeOffRow
    && visibility.timeOff
    && (people.length > 0 || unknownPeopleIds.length > 0)
    && Boolean(onTogglePerson);

  return (
    <MobileScreenShell
      open={open}
      onOpenChange={onOpenChange}
      title={t`On the calendar`}
      contentClassName="space-y-5"
    >
      <MobileListGroup>
        {rows.map((row) => (
          <MobileListRow
            key={row.category}
            title={row.label}
            subtitle={row.hint}
            // The desktop keeps this sentence in a tooltip; a phone has none, so
            // it has to fit on the row itself.
            subtitleLines={2}
            leading={(
              <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
                {row.swatch}
              </span>
            )}
            right={(
              <Switch
                size="touch"
                checked={visibility[row.category]}
                onCheckedChange={() => onToggle(row.category)}
                aria-label={row.label}
              />
            )}
          />
        ))}
      </MobileListGroup>

      {showPeople && (
        <div className="space-y-2.5">
          <div className="mx-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{t`People`}</span>
            {totalCount > 0 && (
              <span className="normal-case tracking-normal">
                {shownCount}/{totalCount}
              </span>
            )}
          </div>

          {/* Segments, not buttons: they also SHOW the state — neither is lit
              when an arbitrary subset is picked, which is the cue that the
              calendar is filtered. */}
          <SegmentedControl surface="compact" className="w-full">
            <SegmentedControlItem
              type="button"
              size="touch"
              fullWidth
              active={selectedPeople === null}
              onClick={onShowAllPeople}
            >
              {t`All`}
            </SegmentedControlItem>
            {myAssigneeId && (
              <SegmentedControlItem
                type="button"
                size="touch"
                fullWidth
                active={selectedPeople?.length === 1 && selectedPeople[0] === myAssigneeId}
                onClick={onShowOnlyMe}
              >
                {t`Only me`}
              </SegmentedControlItem>
            )}
          </SegmentedControl>

          {searchable && (
            <SearchInput
              value={query}
              onValueChange={setQuery}
              placeholder={t`Find a person`}
              className="w-full"
              inputClassName="h-11 rounded-xl"
              clearLabel={t`Clear`}
              autoComplete="off"
              spellCheck={false}
            />
          )}

          <MobileListGroup
            note={hiddenPeopleCount > 0
              ? `${t`Others are not away in this range`} (${hiddenPeopleCount})`
              : undefined}
          >
            {showUnknownRow ? (
              <MobileListRow
                key="unknown"
                title={`${t`Not on the team`} (${unknownPeopleIds.length})`}
                selected={unknownShown}
                onClick={onToggleUnknownPeople}
                leading={(
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
                    <span className="h-3.5 w-3.5 rounded-full bg-muted-foreground/40 ring-1 ring-border" />
                  </span>
                )}
                right={<PersonCheck checked={unknownShown} />}
              />
            ) : null}
            {visiblePeople.map((person) => {
              const shown = isPersonShown(selectedPeople, person.id);
              const color = peopleColors ? resolveTimeOffColor(peopleColors, person.id) : undefined;
              return (
                <MobileListRow
                  key={person.id}
                  title={person.name}
                  selected={shown}
                  onClick={() => onTogglePerson?.(person.id)}
                  className={cn(!shown && 'opacity-45')}
                  leading={(
                    // The monogram carries the colour the calendar draws with, so
                    // the row needs no second chip to say which circle is whose.
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium text-foreground/70 ring-1 ring-border"
                      style={{ backgroundColor: shown ? color : 'transparent' }}
                    >
                      {getPersonMonogram(person.name, '?')}
                    </span>
                  )}
                  right={<PersonCheck checked={shown} />}
                />
              );
            })}
            {/* Only when the card really is empty: the "not on the team" row is
                a row too, and "Nobody found" underneath one reads as nonsense. */}
            {visiblePeople.length === 0 && !showUnknownRow ? (
              <MobileListRow key="empty" title={t`Nobody found`} />
            ) : null}
          </MobileListGroup>
        </div>
      )}
    </MobileScreenShell>
  );
};
