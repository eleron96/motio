import React from 'react';
import { CaptionProps, useNavigation } from 'react-day-picker';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Calendar as CalendarComponent } from '@/shared/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  FolderKanban,
} from 'lucide-react';
import { format, parseISO, addDays, subDays } from '@/features/planner/lib/dateUtils';
import { addMonths, setMonth, setYear, subMonths } from 'date-fns';
import { cn } from '@/shared/lib/classNames';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';

function CalendarCaption({ displayMonth }: CaptionProps) {
  const { goToMonth } = useNavigation();
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);

  const [yearInput, setYearInput] = React.useState(String(displayMonth.getFullYear()));

  React.useEffect(() => {
    setYearInput(String(displayMonth.getFullYear()));
  }, [displayMonth]);

  const commitYear = () => {
    const y = parseInt(yearInput, 10);
    if (!isNaN(y) && y >= 1900 && y <= 2100) {
      goToMonth(setYear(displayMonth, y));
    } else {
      setYearInput(String(displayMonth.getFullYear()));
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i,
    label: format(setMonth(displayMonth, i), 'LLLL', { locale: dateLocale }),
  }));

  return (
    <div className="flex items-center justify-between px-1">
      <button
        type="button"
        onClick={() => goToMonth(subMonths(displayMonth, 1))}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-transparent opacity-50 hover:opacity-100 transition-opacity"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-1 text-sm font-medium">
        {/* Month select */}
        <div className="relative">
          <select
            value={displayMonth.getMonth()}
            onChange={(e) => goToMonth(setMonth(displayMonth, Number(e.target.value)))}
            className="appearance-none capitalize cursor-pointer rounded px-1.5 py-0.5 pr-4 hover:bg-accent transition-colors bg-transparent focus:outline-none focus:ring-1 focus:ring-primary text-sm font-medium"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <ChevronRight className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 h-3 w-3 rotate-90 opacity-50" />
        </div>

        {/* Year input */}
        <input
          type="number"
          value={yearInput}
          onChange={(e) => setYearInput(e.target.value)}
          onBlur={commitYear}
          onKeyDown={(e) => e.key === 'Enter' && commitYear()}
          className="w-[3.2rem] text-center bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors text-sm font-medium [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      <button
        type="button"
        onClick={() => goToMonth(addMonths(displayMonth, 1))}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-transparent opacity-50 hover:opacity-100 transition-opacity"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export const TimelineControls: React.FC = () => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const {
    viewMode,
    setViewMode,
    groupMode,
    setGroupMode,
    currentDate,
    setCurrentDate,
    visibleCenterDate,
    requestScrollToDate,
    filters,
    setFilters,
  } = usePlannerStore();
  const hideUnassignedId = 'hide-unassigned-toggle';
  const showUnassigned = !filters.hideUnassigned;
  const unassignedDisabled = viewMode === 'calendar' || groupMode === 'project';

  const handlePrev = () => {
    const date = parseISO(currentDate);
    const newDate = viewMode === 'calendar'
      ? subMonths(date, 1)
      : subDays(date, 7);
    setCurrentDate(format(newDate, 'yyyy-MM-dd'));
  };

  const handleNext = () => {
    const date = parseISO(currentDate);
    const newDate = viewMode === 'calendar'
      ? addMonths(date, 1)
      : addDays(date, 7);
    setCurrentDate(format(newDate, 'yyyy-MM-dd'));
  };

  const displayDate = parseISO(visibleCenterDate ?? currentDate);

  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [calendarMonth, setCalendarMonth] = React.useState(displayDate);

  const handleOpenChange = (open: boolean) => {
    setCalendarOpen(open);
    if (open) {
      setCalendarMonth(displayDate);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    setCurrentDate(dateStr);
    requestScrollToDate(dateStr);
    setCalendarOpen(false);
  };

  const handleToday = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setCurrentDate(today);
    requestScrollToDate(today);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-2 px-2 py-2 md:gap-x-3 md:px-4 md:py-3 border-b border-border bg-card">
      <div className="flex items-center gap-x-2 gap-y-1 md:gap-x-3 min-w-0 flex-1 md:flex-initial">
        {/* Navigation — hidden on mobile: touch-scroll moves the timeline and
            the floating "Today" FAB covers the jump-to-today action. */}
        <div className="hidden md:flex items-center gap-1 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            className="h-8 w-8"
            aria-label={t`Previous`}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={handleToday}
            className="h-8 px-2 text-sm md:px-3"
          >
            {t`Today`}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            className="h-8 w-8"
            aria-label={t`Next`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Current date display — opens calendar picker */}
        <Popover open={calendarOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <div className="flex items-center gap-1.5 md:gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span
                key={format(displayDate, 'MMM yyyy', { locale: dateLocale })}
                className="inline-block animate-in fade-in slide-in-from-bottom-1 duration-200"
              >
                <span className="md:hidden">{format(displayDate, 'MMM yyyy', { locale: dateLocale })}</span>
                <span className="hidden md:inline">{format(displayDate, 'MMMM yyyy', { locale: dateLocale })}</span>
              </span>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={displayDate}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelect={handleCalendarSelect}
              locale={dateLocale}
              components={{ Caption: CalendarCaption }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:gap-x-3">
        {/* View mode toggle */}
        <SegmentedControl surface="compact">
          <SegmentedControlItem
            active={viewMode === 'day'}
            onClick={() => setViewMode('day')}
          >
            {t`Day`}
          </SegmentedControlItem>
          <SegmentedControlItem
            active={viewMode === 'calendar'}
            onClick={() => setViewMode('calendar')}
            aria-label={t`Calendar`}
          >
            <Calendar className="h-3.5 w-3.5 md:hidden" />
            <span className="hidden md:inline">{t`Calendar`}</span>
          </SegmentedControlItem>
        </SegmentedControl>

        {/* Group mode toggle */}
        <SegmentedControl surface="compact">
          <SegmentedControlItem
            active={groupMode === 'assignee'}
            className="gap-1.5"
            disabled={viewMode === 'calendar'}
            onClick={() => setGroupMode('assignee')}
            aria-label={t`People`}
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t`People`}</span>
          </SegmentedControlItem>
          <SegmentedControlItem
            active={groupMode === 'project'}
            className="gap-1.5"
            disabled={viewMode === 'calendar'}
            onClick={() => setGroupMode('project')}
            aria-label={t`Projects`}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t`Projects`}</span>
          </SegmentedControlItem>
        </SegmentedControl>

        <div
          className="flex items-center gap-2 text-[11px] text-muted-foreground/70 select-none"
          title={t`Show unassigned`}
        >
          <Checkbox
            id={hideUnassignedId}
            checked={showUnassigned}
            onCheckedChange={(value) => setFilters({ hideUnassigned: value !== true })}
            disabled={unassignedDisabled}
            className="scale-75 border-muted-foreground/40 data-[state=checked]:bg-muted-foreground/60 data-[state=checked]:border-muted-foreground/60 data-[state=checked]:text-white/90"
            aria-label={t`Show unassigned`}
          />
          <label
            htmlFor={hideUnassignedId}
            className={cn('cursor-pointer hidden sm:inline', unassignedDisabled && 'opacity-60 cursor-not-allowed')}
          >
            {t`Unassigned`}
          </label>
        </div>
      </div>
    </div>
  );
};
