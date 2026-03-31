import React, { MutableRefObject } from 'react';
import { t } from '@lingui/macro';
import { Plus, X } from 'lucide-react';
import { TaskSubtask } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/classNames';

interface SubtasksSectionProps {
  isReadOnly: boolean;
  subtasksOpen: boolean;
  subtasksLoading: boolean;
  subtasksSaving: boolean;
  subtasksError: string;
  subtasks: TaskSubtask[];
  newSubtaskTitle: string;
  completedSubtasksCount: number;
  subtaskInputRef: MutableRefObject<HTMLInputElement | null>;
  onOpen: () => void;
  onNewTitleChange: (value: string) => void;
  onAdd: () => void;
  onToggle: (subtaskId: string, isDone: boolean) => void;
  onDelete: (subtaskId: string) => void;
}

export const SubtasksSection: React.FC<SubtasksSectionProps> = ({
  isReadOnly,
  subtasksOpen,
  subtasksLoading,
  subtasksSaving,
  subtasksError,
  subtasks,
  newSubtaskTitle,
  completedSubtasksCount,
  subtaskInputRef,
  onOpen,
  onNewTitleChange,
  onAdd,
  onToggle,
  onDelete,
}) => {
  if (!subtasksOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-8 w-fit gap-1.5 text-xs"
        onClick={onOpen}
      >
        <Plus className="h-3.5 w-3.5" />
        {t`Add subtask`}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-xs text-muted-foreground">
        {t`Completed`}: <span className="font-medium text-foreground">{completedSubtasksCount}</span>/{subtasks.length}
      </div>

      <div className="flex items-center gap-2">
        <Input
          ref={subtaskInputRef}
          value={newSubtaskTitle}
          onChange={(event) => onNewTitleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            onAdd();
          }}
          placeholder={t`Subtask title`}
          disabled={isReadOnly || subtasksSaving}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          className="h-8 px-3 text-xs"
          onClick={onAdd}
          disabled={isReadOnly || subtasksSaving || !newSubtaskTitle.trim()}
        >
          {t`Add`}
        </Button>
      </div>

      {subtasksError && (
        <div className="text-xs text-destructive">{subtasksError}</div>
      )}

      {subtasksLoading ? (
        <div className="text-xs text-muted-foreground">{t`Loading...`}</div>
      ) : subtasks.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t`No subtasks yet.`}</div>
      ) : (
        <div className="space-y-1.5">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="flex items-start gap-2 rounded-md border px-2.5 py-2"
            >
              <Checkbox
                checked={subtask.isDone}
                onCheckedChange={(value) => {
                  if (value === 'indeterminate') return;
                  onToggle(subtask.id, value === true);
                }}
                disabled={isReadOnly}
              />
              <span
                className={cn(
                  'flex-1 text-sm leading-snug text-foreground',
                  subtask.isDone && 'line-through text-muted-foreground',
                )}
              >
                {subtask.title}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onDelete(subtask.id)}
                disabled={isReadOnly}
                aria-label={t`Remove subtask`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
