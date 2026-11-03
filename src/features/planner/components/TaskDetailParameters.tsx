import React from 'react';
import { t } from '@lingui/macro';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { ResponsiveSelect } from '@/shared/ui/responsive-select';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';
import { TaskProjectSelect } from '@/features/planner/components/TaskProjectSelect';
import { RepeatPopoverField } from '@/features/planner/components/RepeatPopoverField';
import { TagMultiSelect } from '@/features/planner/components/TagMultiSelect';
import { TaskAssigneeField } from '@/features/planner/components/TaskAssigneeField';
import { getRepeatOccurrenceDate } from '@/features/planner/lib/taskFormRules';
import { getMinEndDate } from '@/features/planner/lib/dateUtils';
import type { UseTaskRepeatConfigResult } from '@/features/planner/hooks/useTaskRepeatConfig';
import type { Assignee, Project, Status, Tag, Task, TaskPriority, TaskType } from '@/features/planner/types/planner';

interface TaskDetailParametersProps {
  task: Task;
  projectOptions: Project[];
  noProjectDisabled: boolean;
  canEdit: boolean;
  isMobile: boolean;
  assignees: Assignee[];
  filteredAssignees: Assignee[];
  pickedAssigneeIds: string[];
  setPickedAssigneeIds: (ids: string[]) => void;
  statuses: Status[];
  taskTypes: TaskType[];
  tags: Tag[];
  pickedTagIds: string[];
  setPickedTagIds: (ids: string[]) => void;
  onUpdate: (field: keyof Task, value: Task[keyof Task]) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  repeat: Pick<
    UseTaskRepeatConfigResult,
    | 'repeatCount'
    | 'repeatEnds'
    | 'repeatError'
    | 'repeatFrequency'
    | 'repeatNotice'
    | 'repeatUntil'
    | 'handleRepeatCountInputChange'
    | 'handleRepeatEndsChange'
    | 'handleRepeatFrequencyChange'
    | 'handleRepeatUntilChange'
  >;
}

/** The right column of the task card: project, people, status, priority, type, dates, repeat and tags. */
export const TaskDetailParameters: React.FC<TaskDetailParametersProps> = ({
  task,
  projectOptions,
  noProjectDisabled,
  canEdit,
  isMobile,
  assignees,
  filteredAssignees,
  pickedAssigneeIds,
  setPickedAssigneeIds,
  statuses,
  taskTypes,
  tags,
  pickedTagIds,
  setPickedTagIds,
  onUpdate,
  onStartDateChange,
  onEndDateChange,
  repeat,
}) => {
  const isReadOnly = !canEdit;

  const handleTagToggle = (tagId: string) => {
    if (!canEdit) return;
    const newTagIds = pickedTagIds.includes(tagId)
      ? pickedTagIds.filter(id => id !== tagId)
      : [...pickedTagIds, tagId];
    setPickedTagIds(newTagIds);
  };

  return (
    <div className="space-y-3.5 border-t border-border bg-secondary/70 px-5 pb-6 pt-4 lg:border-0 lg:bg-transparent lg:pt-1">
      <ComposerEyebrow>{t`Parameters`}</ComposerEyebrow>

      <div className="space-y-1.5">
        <Label>{t`Project`}</Label>
        <TaskProjectSelect
          value={task.projectId || 'none'}
          projects={projectOptions}
          disabled={isReadOnly}
          noProjectDisabled={noProjectDisabled}
          showArchivedBadge
          triggerClassName="h-auto min-h-10 bg-background [&>span]:line-clamp-2"
          onValueChange={(v) => {
            if (noProjectDisabled && v === 'none') return;
            onUpdate('projectId', v === 'none' ? null : v);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t`Assignees`}</Label>
        <TaskAssigneeField
          assignees={assignees}
          filteredAssignees={filteredAssignees}
          pickedAssigneeIds={pickedAssigneeIds}
          setPickedAssigneeIds={setPickedAssigneeIds}
          canEdit={canEdit}
          isMobile={isMobile}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label>{t`Status`}</Label>
          <ResponsiveSelect
            value={task.statusId}
            onValueChange={(v) => onUpdate('statusId', v)}
            disabled={isReadOnly}
            title={t`Status`}
            placeholder={t`Select status`}
            triggerClassName="min-w-0 overflow-hidden whitespace-nowrap bg-background text-left"
            valueClassName="truncate text-left"
            itemLabelClassName="truncate"
            options={statuses.map((s) => ({
              value: s.id,
              label: formatStatusLabel(s.name, s.emoji),
            }))}
          />
        </div>

        <div className="space-y-1.5 min-w-0">
          <Label>{t`Priority`}</Label>
          <ResponsiveSelect
            value={task.priority ?? 'none'}
            onValueChange={(value) => onUpdate('priority', value === 'none' ? null : (value as TaskPriority))}
            disabled={isReadOnly}
            title={t`Priority`}
            placeholder={t`Select priority`}
            triggerClassName="bg-background text-left"
            valueClassName="truncate text-left"
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
          value={task.typeId}
          onValueChange={(v) => onUpdate('typeId', v)}
          disabled={isReadOnly}
          title={t`Type`}
          placeholder={t`Select type`}
          triggerClassName="bg-background text-left"
          valueClassName="truncate text-left"
          options={taskTypes.map((type) => ({ value: type.id, label: type.name }))}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="startDate">{t`Start Date`}</Label>
          <Input
            id="startDate"
            type="date"
            value={task.startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            disabled={isReadOnly}
            className="bg-background px-2 text-sm tabular-nums"
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="endDate">{t`End Date`}</Label>
          <Input
            id="endDate"
            type="date"
            value={task.endDate}
            min={getMinEndDate(task.startDate)}
            onChange={(e) => onEndDateChange(e.target.value)}
            disabled={isReadOnly}
            className="bg-background px-2 text-sm tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t`Repeat`}</Label>
        <RepeatPopoverField
          count={repeat.repeatCount}
          disabled={isReadOnly}
          ends={repeat.repeatEnds}
          error={repeat.repeatError}
          frequency={repeat.repeatFrequency}
          idPrefix="detail"
          notice={repeat.repeatNotice}
          onCountInputChange={repeat.handleRepeatCountInputChange}
          onEndsChange={repeat.handleRepeatEndsChange}
          onFrequencyChange={repeat.handleRepeatFrequencyChange}
          onUntilChange={repeat.handleRepeatUntilChange}
          projectedEnd={getRepeatOccurrenceDate(task.startDate, repeat.repeatFrequency, Math.max(0, repeat.repeatCount - 1))}
          showNeverHint
          until={repeat.repeatUntil}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t`Tags`}</Label>
        <TagMultiSelect
          tags={tags}
          selectedTagIds={pickedTagIds}
          onToggleTag={handleTagToggle}
          disabled={isReadOnly}
        />
      </div>
    </div>
  );
};
