import React from 'react';
import { t } from '@lingui/macro';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { getPersonMonogram } from '@/shared/domain/personName';
import { getMinEndDate } from '@/features/planner/lib/dateUtils';
import type { Assignee } from '@/features/planner/types/planner';

export interface TimeOffFieldsProps {
  assignees: Assignee[];
  assigneeId: string;
  onAssigneeChange: (id: string) => void;
  /** Workspace admins may record days off for anyone; everyone else only for themselves. */
  canPickAssignee: boolean;
  startDate: string;
  endDate: string;
  note: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  /** Shown when the chosen period collides with another record of that person. */
  conflictMessage?: string | null;
  idPrefix?: string;
}

/**
 * The body of the "Отметить выходной" form, shared by the create dialog (as the
 * second mode of AddTaskDialog) and by the edit dialog.
 */
export const TimeOffFields: React.FC<TimeOffFieldsProps> = ({
  assignees,
  assigneeId,
  onAssigneeChange,
  canPickAssignee,
  startDate,
  endDate,
  note,
  onStartDateChange,
  onEndDateChange,
  onNoteChange,
  conflictMessage,
  idPrefix = 'time-off',
}) => {
  const person = assignees.find((assignee) => assignee.id === assigneeId) ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-assignee`} className="text-xs uppercase tracking-wide text-muted-foreground">
          {t`Person`}
        </Label>
        {canPickAssignee ? (
          <Select value={assigneeId} onValueChange={onAssigneeChange}>
            <SelectTrigger id={`${idPrefix}-assignee`}>
              <SelectValue placeholder={t`Select a person`} />
            </SelectTrigger>
            <SelectContent>
              {assignees.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div
            id={`${idPrefix}-assignee`}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            <PersonAvatar
              assigneeId={person?.id}
              userId={person?.userId}
              name={person?.name ?? null}
              avatarUrl={person?.avatar ?? null}
              initials={getPersonMonogram(person?.name ?? '', 'U')}
              className="h-6 w-6"
            />
            <span className="truncate">{person?.name ?? ''}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {t`marking yourself`}
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`} className="text-xs uppercase tracking-wide text-muted-foreground">
            {t`Start date`}
          </Label>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            className="bg-background px-2 text-sm tabular-nums"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${idPrefix}-end`} className="text-xs uppercase tracking-wide text-muted-foreground">
            {t`End date`}
          </Label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            className="bg-background px-2 text-sm tabular-nums"
            value={endDate}
            min={getMinEndDate(startDate)}
            onChange={(event) => onEndDateChange(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-note`} className="text-xs uppercase tracking-wide text-muted-foreground">
          {t`Note`}
        </Label>
        <Input
          id={`${idPrefix}-note`}
          value={note}
          maxLength={200}
          placeholder={t`Vacation, day off, sick leave...`}
          onChange={(event) => onNoteChange(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t`Visible to the whole team.`}</p>
      </div>

      {conflictMessage && (
        <p className="text-sm text-destructive">{conflictMessage}</p>
      )}
    </div>
  );
};
