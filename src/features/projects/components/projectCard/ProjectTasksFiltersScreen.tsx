import React from 'react';
import { t } from '@lingui/macro';
import { Check } from 'lucide-react';
import type { Assignee, Status } from '@/features/planner/types/planner';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { Button } from '@/shared/ui/button';
import { SearchInput } from '@/shared/ui/SearchInput';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { cn } from '@/shared/lib/classNames';

interface ProjectTasksFiltersScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statuses: Status[];
  statusFilterIds: string[];
  onToggleStatus: (statusId: string) => void;
  setStatusPreset: (mode: 'all' | 'open' | 'done') => void;
  assigneeOptions: Assignee[];
  assigneeFilterIds: string[];
  onToggleAssignee: (assigneeId: string) => void;
  onClearFilters: () => void;
}

/**
 * Filters for a project's tasks, phone-style.
 *
 * The card shows them as two popovers, each wrapping its own scroller — a
 * shape a finger cannot scroll. Here they are rows on a screen.
 */
export const ProjectTasksFiltersScreen: React.FC<ProjectTasksFiltersScreenProps> = ({
  open,
  onOpenChange,
  search,
  onSearchChange,
  statuses,
  statusFilterIds,
  onToggleStatus,
  setStatusPreset,
  assigneeOptions,
  assigneeFilterIds,
  onToggleAssignee,
  onClearFilters,
}) => {
  // A drawn box rather than a checkbox: the row is the button, and a control
  // nested in a button is invalid markup whose taps land twice.
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
          title={t`Assignees`}
          note={assigneeOptions.length === 0 ? t`No assignees on this project.` : undefined}
        >
          {assigneeOptions.map((assignee) => {
            const checked = assigneeFilterIds.includes(assignee.id);
            return (
              <MobileListRow
                key={assignee.id}
                title={assignee.name}
                value={assignee.isActive ? undefined : t`(disabled)`}
                right={tick(checked)}
                selected={checked}
                onClick={() => onToggleAssignee(assignee.id)}
              />
            );
          })}
        </MobileListGroup>

        <Button type="button" variant="outline" className="h-12 w-full" onClick={onClearFilters}>
          {t`Clear filters`}
        </Button>
      </div>
    </MobileScreenShell>
  );
};
