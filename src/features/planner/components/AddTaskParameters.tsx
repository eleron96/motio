import React from 'react';
import { ChevronDown } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ResponsiveSelect } from '@/shared/ui/responsive-select';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { getPersonMonogram } from '@/shared/domain/personName';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';
import { MobileAssigneeField } from '@/features/planner/components/MobileAssigneeField';
import { RepeatPopoverField } from '@/features/planner/components/RepeatPopoverField';
import { TagMultiSelect } from '@/features/planner/components/TagMultiSelect';
import { TaskProjectSelect } from '@/features/planner/components/TaskProjectSelect';
import { clampTaskDates, getMinEndDate } from '@/features/planner/lib/dateUtils';
import { getRepeatOccurrenceDate } from '@/features/planner/lib/taskFormRules';
import type { AddTaskForm } from '@/features/planner/hooks/useAddTaskForm';
import type { TaskPriority } from '@/features/planner/types/planner';

interface AddTaskParametersProps {
  form: AddTaskForm;
  isMobile: boolean;
  /** The project is fixed (the projects page adds tasks to its open project). */
  lockProject: boolean;
}

/** The right column of the add-task dialog: project, people, status, priority, type, dates, repeat and tags. */
export const AddTaskParameters: React.FC<AddTaskParametersProps> = ({ form, isMobile, lockProject }) => {
  const {
    statuses,
    taskTypes,
    tags,
    activeProjects,
    selectableAssignees,
    orderedSelectableAssignees,
    assigneeLabel,
    noProjectDisabled,
    projectId,
    setProjectId,
    assigneeIds,
    setAssigneeIds,
    statusId,
    setStatusId,
    typeId,
    setTypeId,
    priority,
    setPriority,
    startDate,
    endDate,
    setEndDate,
    tagIds,
    assigneePopoverOpen,
    markChanged,
    repeat,
    handleTagToggle,
    setAssigneeChecked,
    handleStartDateChange,
    handleAssigneePopoverOpenChange,
  } = form;
  const {
    repeatCount,
    repeatEnds,
    repeatError,
    repeatFrequency,
    repeatUntil,
    handleRepeatCountInputChange,
    handleRepeatEndsChange,
    handleRepeatFrequencyChange,
    handleRepeatUntilChange,
  } = repeat;

  return (
    <div className="min-w-0 space-y-3.5 border-t border-border bg-secondary/70 px-5 pb-6 pt-4 md:border-0 md:bg-transparent md:pt-0">
      <ComposerEyebrow>{t`Parameters`}</ComposerEyebrow>

      <div className="space-y-1.5">
        <Label>{t`Project`}</Label>
        <TaskProjectSelect
          value={projectId}
          projects={activeProjects}
          noProjectDisabled={noProjectDisabled}
          disabled={lockProject}
          triggerClassName="h-auto min-h-10 bg-background [&>span]:line-clamp-2"
          onValueChange={(value) => {
            markChanged();
            setProjectId(value);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t`Assignees`}</Label>
        {isMobile ? (
          <MobileAssigneeField
            label={assigneeLabel}
            assignees={orderedSelectableAssignees}
            selectedIds={assigneeIds}
            onChange={(ids) => {
              markChanged();
              setAssigneeIds(ids);
            }}
          />
        ) : (
        <Popover open={assigneePopoverOpen} onOpenChange={handleAssigneePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between bg-background font-normal">
              <span className="truncate">{assigneeLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            {selectableAssignees.length === 0 ? (
              <div className="text-xs text-muted-foreground">{t`No assignees yet.`}</div>
            ) : (
              <div
                className="max-h-48 overflow-y-auto overscroll-contain pr-2"
                onWheelCapture={(e) => e.stopPropagation()}
              >
                <div className="space-y-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm py-1 text-left hover:bg-accent/50"
                    onClick={() => {
                      markChanged();
                      setAssigneeIds([]);
                    }}
                  >
                    <Checkbox
                      checked={assigneeIds.length === 0}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={(checked) => {
                        if (checked !== true) return;
                        markChanged();
                        setAssigneeIds([]);
                      }}
                    />
                    <span className="text-sm truncate">{t`Unassigned`}</span>
                  </button>
                  {orderedSelectableAssignees.map((assignee) => (
                    <button
                      key={assignee.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm py-1 text-left hover:bg-accent/50"
                      onClick={() => setAssigneeChecked(assignee.id, !assigneeIds.includes(assignee.id))}
                    >
                      <Checkbox
                        checked={assigneeIds.includes(assignee.id)}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={(checked) => setAssigneeChecked(assignee.id, checked === true)}
                      />
                      <PersonAvatar
                        assigneeId={assignee.id}
                        userId={assignee.userId}
                        avatarUrl={assignee.avatar}
                        initials={getPersonMonogram(assignee.name, 'U')}
                        colorSeed={assignee.userId ?? assignee.id}
                        size="xs"
                      />
                      <span className="text-sm truncate">{assignee.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label>{t`Status`}</Label>
          <ResponsiveSelect
            value={statusId}
            onValueChange={(value) => {
              markChanged();
              setStatusId(value);
            }}
            title={t`Status`}
            placeholder={t`Select status`}
            triggerClassName="bg-background"
            options={statuses.map((s) => ({
              value: s.id,
              label: formatStatusLabel(s.name, s.emoji),
            }))}
          />
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label>{t`Priority`}</Label>
          <ResponsiveSelect
            value={priority}
            onValueChange={(value) => {
              markChanged();
              setPriority(value as TaskPriority | 'none');
            }}
            title={t`Priority`}
            placeholder={t`Select priority`}
            triggerClassName="bg-background"
            options={[
              { value: 'none', label: t`No priority` },
              { value: 'low', label: t`Low` },
              { value: 'medium', label: t`Medium` },
              { value: 'high', label: t`High` },
            ]}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t`Type`}</Label>
        <ResponsiveSelect
          value={typeId}
          onValueChange={(value) => {
            markChanged();
            setTypeId(value);
          }}
          title={t`Type`}
          placeholder={t`Select type`}
          triggerClassName="bg-background"
          options={taskTypes.map((type) => ({ value: type.id, label: type.name }))}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="new-start">{t`Start date`}</Label>
          <Input
            id="new-start"
            type="date"
            className="bg-background px-2 text-sm tabular-nums"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="new-end">{t`End date`}</Label>
          <Input
            id="new-end"
            type="date"
            className="bg-background px-2 text-sm tabular-nums"
            value={endDate}
            min={getMinEndDate(startDate)}
            onChange={(e) => {
              markChanged();
              setEndDate(clampTaskDates(startDate, e.target.value).endDate);
            }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t`Repeat`}</Label>
        <RepeatPopoverField
          count={repeatCount}
          ends={repeatEnds}
          error={repeatError}
          frequency={repeatFrequency}
          idPrefix="new"
          onCountInputChange={handleRepeatCountInputChange}
          onEndsChange={handleRepeatEndsChange}
          onFrequencyChange={handleRepeatFrequencyChange}
          onUntilChange={handleRepeatUntilChange}
          projectedEnd={getRepeatOccurrenceDate(startDate, repeatFrequency, repeatCount)}
          until={repeatUntil}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t`Tags`}</Label>
        <TagMultiSelect
          tags={tags}
          selectedTagIds={tagIds}
          onToggleTag={handleTagToggle}
        />
      </div>
    </div>
  );
};
