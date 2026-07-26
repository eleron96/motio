import React from 'react';
import { t } from '@lingui/macro';
import { Checkbox } from '@/shared/ui/checkbox';
import { Button } from '@/shared/ui/button';
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
  onShowAllPeople?: () => void;
  onShowOnlyMe?: () => void;
  /** Enables the "Only me" shortcut; absent when the viewer has no person row. */
  myAssigneeId?: string | null;
  className?: string;
}

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
  onShowAllPeople,
  onShowOnlyMe,
  myAssigneeId = null,
  className,
}) => {
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
          <label
            key={row.category}
            className="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-muted/60"
          >
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
        ))}
      </div>

      {showTimeOffRow && visibility.timeOff && people.length > 0 && onTogglePerson && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t`People`}
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={onShowAllPeople}
              >
                {t`All`}
              </Button>
              {myAssigneeId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={onShowOnlyMe}
                >
                  {t`Only me`}
                </Button>
              )}
            </span>
          </div>

          <div className="max-h-64 space-y-0.5 overflow-y-auto px-2 pb-2">
            {people.map((person) => (
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
          </div>
        </div>
      )}
    </aside>
  );
};
