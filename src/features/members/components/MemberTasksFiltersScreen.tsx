import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Check } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/classNames';
import { SearchInput } from '@/shared/ui/SearchInput';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import type { Project, Status } from '@/features/planner/types/planner';
import type { PastTaskSort } from '@/shared/domain/taskScope';

interface MemberTasksFiltersScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statuses: Status[];
  statusFilterIds: string[];
  onToggleStatus: (statusId: string) => void;
  setStatusPreset: (mode: 'all' | 'open' | 'done') => void;
  projectOptions: Project[];
  projectFilterIds: string[];
  onToggleProject: (projectId: string) => void;
  /** Dates and sorting only apply to the past-tasks view. */
  taskScope: 'current' | 'past';
  pastFromDate: string;
  onPastFromDateChange: (value: string) => void;
  pastToDate: string;
  onPastToDateChange: (value: string) => void;
  pastSort: PastTaskSort;
  onPastSortChange: (value: PastTaskSort) => void;
  onClearFilters: () => void;
}

/**
 * The member's task filters, phone-style.
 *
 * They used to be an accordion of popovers inside the page: each popover put a
 * scroller inside a floating layer, which on a phone simply cannot be reached
 * with a finger. Here every option is a row on a screen you scroll normally.
 */
export const MemberTasksFiltersScreen: React.FC<MemberTasksFiltersScreenProps> = ({
  open,
  onOpenChange,
  search,
  onSearchChange,
  statuses,
  statusFilterIds,
  onToggleStatus,
  setStatusPreset,
  projectOptions,
  projectFilterIds,
  onToggleProject,
  taskScope,
  pastFromDate,
  onPastFromDateChange,
  pastToDate,
  onPastToDateChange,
  pastSort,
  onPastSortChange,
  onClearFilters,
}) => {
  const [sortPickerOpen, setSortPickerOpen] = useState(false);

  const sortOptions: MobilePickerOption[] = [
    { value: 'end_desc', label: t`End date ↓` },
    { value: 'end_asc', label: t`End date ↑` },
    { value: 'start_desc', label: t`Start date ↓` },
    { value: 'start_asc', label: t`Start date ↑` },
    { value: 'title_asc', label: t`Title A–Z` },
    { value: 'title_desc', label: t`Title Z–A` },
  ];
  const sortLabel = sortOptions.find((option) => option.value === pastSort)?.label ?? '';

  // A drawn box rather than a real checkbox: the row itself is the button, and
  // a control nested inside a button is invalid markup whose taps land twice.
  const tick = (checked: boolean) => (
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

  return (
    <>
      <MobileScreenShell
        open={open}
        onOpenChange={onOpenChange}
        title={t`Filters`}
        toolbar={(
          <SearchInput
            value={search}
            onValueChange={onSearchChange}
            placeholder={t`Search tasks...`}
            className="w-full"
            inputClassName="h-11 rounded-xl text-sm"
            clearLabel={t`Clear search`}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        )}
      >
        <div className="space-y-5">
          <div className="space-y-2.5">
            <SegmentedControl surface="filled" className="w-full">
              <SegmentedControlItem size="touch" fullWidth onClick={() => setStatusPreset('all')}>
                {t`All`}
              </SegmentedControlItem>
              <SegmentedControlItem size="touch" fullWidth onClick={() => setStatusPreset('open')}>
                {t`Open`}
              </SegmentedControlItem>
              <SegmentedControlItem size="touch" fullWidth onClick={() => setStatusPreset('done')}>
                {t`Done`}
              </SegmentedControlItem>
            </SegmentedControl>

            <MobileListGroup title={t`Statuses`}>
              {statuses.map((status) => {
                const checked = statusFilterIds.includes(status.id);
                return (
                  <MobileListRow
                    key={status.id}
                    title={formatStatusLabel(status.name, status.emoji)}
                    right={tick(checked)}
                    selected={checked}
                    onClick={() => onToggleStatus(status.id)}
                  />
                );
              })}
            </MobileListGroup>
          </div>

          <MobileListGroup
            title={t`Projects`}
            note={projectOptions.length === 0 ? t`No projects for this member.` : undefined}
          >
            {projectOptions.map((project) => {
              const checked = projectFilterIds.includes(project.id);
              return (
                <MobileListRow
                  key={project.id}
                  leading={(
                    <span
                      aria-hidden="true"
                      className="inline-flex h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                  )}
                  title={formatProjectLabel(project.name, project.code)}
                  right={tick(checked)}
                  selected={checked}
                  onClick={() => onToggleProject(project.id)}
                />
              );
            })}
          </MobileListGroup>

          {taskScope === 'past' && (
            <div className="space-y-2.5">
              <MobileListGroup title={t`Period`}>
                <MobileListRow
                  title={t`From`}
                  right={(
                    <Input
                      type="date"
                      value={pastFromDate}
                      onChange={(event) => onPastFromDateChange(event.target.value)}
                      // 16px keeps iOS from zooming the page on focus.
                      className="h-10 w-[9.5rem] text-base"
                      aria-label={t`From`}
                    />
                  )}
                />
                <MobileListRow
                  title={t`To`}
                  right={(
                    <Input
                      type="date"
                      value={pastToDate}
                      onChange={(event) => onPastToDateChange(event.target.value)}
                      className="h-10 w-[9.5rem] text-base"
                      aria-label={t`To`}
                    />
                  )}
                />
              </MobileListGroup>

              <MobileListGroup title={t`Sorting`}>
                <MobileListRow
                  title={t`Order`}
                  value={sortLabel}
                  chevron
                  onClick={() => setSortPickerOpen(true)}
                />
              </MobileListGroup>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full"
            onClick={onClearFilters}
          >
            {t`Clear filters`}
          </Button>
        </div>
      </MobileScreenShell>

      <MobilePickerScreen
        open={sortPickerOpen}
        onOpenChange={setSortPickerOpen}
        title={t`Sorting`}
        options={sortOptions}
        value={pastSort}
        onValueChange={(value) => onPastSortChange(value as PastTaskSort)}
      />
    </>
  );
};
