import React from 'react';
import { t } from '@lingui/macro';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { ChevronDown } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { cn } from '@/shared/lib/classNames';
import { isPersonShown } from '@/features/planner/lib/calendarDayMarkers';
import { resolveTimeOffColor } from '@/features/planner/lib/timeOffPalette';
import type {
  CalendarOverlayCategory,
  CalendarOverlayVisibility,
  CalendarPeopleSelection,
} from '@/features/planner/lib/calendarDayMarkers';
import type { Assignee } from '@/features/planner/types/planner';

export interface CalendarLegendPanelProps {
  visibility: CalendarOverlayVisibility;
  onToggle: (category: CalendarOverlayCategory) => void;
  /** Rendered only when the time-off feature is available to this deployment. */
  showTimeOffRow?: boolean;
  /** People whose time off can be shown; the list is hidden when empty. */
  people?: Assignee[];
  peopleColors?: Map<string, string>;
  selectedPeople?: CalendarPeopleSelection;
  onTogglePerson?: (assigneeId: string) => void;
  /** People with time off who are not on the assignee list; shown as one row. */
  unknownPeopleIds?: string[];
  onToggleUnknownPeople?: () => void;
  /** Teammates with no time off in the window — counted, not listed. */
  hiddenPeopleCount?: number;
  onShowAllPeople?: () => void;
  onShowOnlyMe?: () => void;
  /** Enables the "Only me" shortcut; absent when the viewer has no person row. */
  myAssigneeId?: string | null;
  className?: string;
}

/** Above this many people the list gets a filter box. */
const SEARCH_THRESHOLD = 10;

/** Above this many the list starts folded. */
const COLLAPSE_THRESHOLD = 8;

type LegendRow = {
  category: CalendarOverlayCategory;
  label: string;
  hint: string;
  swatch: React.ReactNode;
};

/**
 * The legend on the right of the calendar: what each mark means, and a checkbox
 * to hide it. Fully controlled — the state and its persistence live in
 * CalendarTimeline, so this component stays trivial to render in tests.
 */
export const CalendarLegendPanel: React.FC<CalendarLegendPanelProps> = ({
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
  className,
}) => {
  // A search box only earns its space once the list stops fitting; below that it
  // is one more thing to look past.
  const [query, setQuery] = React.useState('');
  const [collapsed, setCollapsed] = React.useState(false);
  const searchable = people.length > SEARCH_THRESHOLD;
  const visiblePeople = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => person.name.toLowerCase().includes(needle));
  }, [people, query]);
  const totalCount = people.length + (unknownPeopleIds.length > 0 ? 1 : 0);
  // A long list starts folded so the panel stays compact; a short one is open,
  // because folding four names away helps nobody.
  const autoCollapsed = totalCount > COLLAPSE_THRESHOLD;
  const [collapseTouched, setCollapseTouched] = React.useState(false);
  const isCollapsed = collapseTouched ? collapsed : autoCollapsed;
  const unknownShown = selectedPeople === null
    || unknownPeopleIds.every((id) => selectedPeople.includes(id));
  const shownCount = selectedPeople === null
    ? totalCount
    : people.filter((person) => selectedPeople.includes(person.id)).length
      + (unknownPeopleIds.length > 0 && unknownShown ? 1 : 0);

  const rows: LegendRow[] = [
    {
      category: 'holidays',
      label: t`Show holidays`,
      hint: t`Non-working days of the country set for the workspace.`,
      swatch: <span className="h-4 w-4 shrink-0 rounded-full bg-rose-200/70" />,
    },
    {
      category: 'milestones',
      label: t`Show milestones`,
      hint: t`Deliveries, coloured by project.`,
      swatch: (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        </span>
      ),
    },
  ];

  if (showTimeOffRow) {
    rows.push({
      category: 'timeOff',
      label: t`Show team time off`,
      hint: t`A circle on the day; split when several people are away.`,
      swatch: (
        <span
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border"
          style={{
            background: 'conic-gradient(from 0deg, hsl(210, 72%, 80%) 0deg 180deg, hsl(150, 55%, 76%) 181deg 360deg)',
          }}
        />
      ),
    });
  }

  // Nested under its own checkbox rather than parked at the bottom of the
  // panel: the list only makes sense for that category, and a separate section
  // left a hole in the middle.
  const peopleBlock = showTimeOffRow
    && visibility.timeOff
    && (people.length > 0 || unknownPeopleIds.length > 0)
    && onTogglePerson
    ? (
        <div className="ml-5 border-l border-border pl-2">
          <div className="space-y-2 px-1 pb-1 pt-1">
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => {
                setCollapseTouched(true);
                setCollapsed(!isCollapsed);
              }}
              aria-expanded={!isCollapsed}
            >
              <ChevronDown
                className={cn('h-3 w-3 shrink-0 transition-transform', isCollapsed && '-rotate-90')}
                aria-hidden="true"
              />
              {t`People`}
              {totalCount > 0 && (
                <span className="normal-case tracking-normal">
                  {shownCount}/{totalCount}
                </span>
              )}
            </button>
            {/* Segments, not buttons: they also SHOW the state — neither is lit
                when an arbitrary subset is picked, which is the cue that the
                calendar is filtered. */}
            {!isCollapsed && (
            <SegmentedControl surface="compact" className="w-full">
              <SegmentedControlItem
                type="button"
                size="xs"
                fullWidth
                active={selectedPeople === null}
                onClick={onShowAllPeople}
              >
                {t`All`}
              </SegmentedControlItem>
              {myAssigneeId && (
                <SegmentedControlItem
                  type="button"
                  size="xs"
                  fullWidth
                  active={selectedPeople?.length === 1 && selectedPeople[0] === myAssigneeId}
                  onClick={onShowOnlyMe}
                >
                  {t`Only me`}
                </SegmentedControlItem>
              )}
            </SegmentedControl>
            )}
          </div>

          {!isCollapsed && searchable && (
            <div className="px-1 pb-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t`Find a person`}
                className="h-7 text-sm"
              />
            </div>
          )}

          {!isCollapsed && (
          <div className="max-h-56 space-y-0.5 overflow-y-auto px-1 pb-2">
            {visiblePeople.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">{t`Nobody found`}</p>
            )}
            {unknownPeopleIds.length > 0 && !query.trim() && onToggleUnknownPeople && (
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
                <Checkbox checked={unknownShown} onCheckedChange={onToggleUnknownPeople} />
                <span className="h-3 w-3 shrink-0 rounded-full bg-muted-foreground/40 ring-1 ring-border" />
                <span className="min-w-0 truncate text-sm leading-snug text-muted-foreground">
                  {t`Not on the team`} ({unknownPeopleIds.length})
                </span>
              </label>
            )}
            {visiblePeople.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60"
              >
                <Checkbox
                  checked={isPersonShown(selectedPeople, person.id)}
                  onCheckedChange={() => onTogglePerson(person.id)}
                />
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-1 ring-border"
                  style={{
                    backgroundColor: peopleColors
                      ? resolveTimeOffColor(peopleColors, person.id)
                      : undefined,
                  }}
                />
                <span className="min-w-0 truncate text-sm leading-snug">{person.name}</span>
              </label>
            ))}
            {hiddenPeopleCount > 0 && (
              <p className="border-t border-border/60 px-2 pt-2 text-[11px] leading-snug text-muted-foreground">
                {t`Others are not away in this range`} ({hiddenPeopleCount})
              </p>
            )}
          </div>
          )}
        </div>
      )
    : null;

  return (
    <aside
      className={cn(
        'hidden w-56 shrink-0 flex-col border-l border-border bg-card md:flex',
        className,
      )}
      aria-label={t`Calendar legend`}
    >
      <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
        {t`On the calendar`}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {rows.map((row) => (
          <React.Fragment key={row.category}>
            <label className="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-muted/60">
              <Checkbox
                className="mt-0.5"
                checked={visibility[row.category]}
                onCheckedChange={() => onToggle(row.category)}
              />
              {row.swatch}
              <span className="min-w-0">
                <span className="block text-sm leading-snug">{row.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{row.hint}</span>
              </span>
            </label>
            {row.category === 'timeOff' && peopleBlock}
          </React.Fragment>
        ))}
      </div>

    </aside>
  );
};
