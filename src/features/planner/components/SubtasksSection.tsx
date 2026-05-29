import React, { MutableRefObject, useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { Pencil, Plus, X } from 'lucide-react';
import { TaskSubtask } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Textarea } from '@/shared/ui/textarea';
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
  subtaskInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  onOpen: () => void;
  onNewTitleChange: (value: string) => void;
  onAdd: () => void;
  onEdit: (subtaskId: string, title: string) => Promise<boolean>;
  onToggle: (subtaskId: string, isDone: boolean) => void;
  onDelete: (subtaskId: string) => void;
  /**
   * Fires whenever an inline subtask edit has uncommitted changes, so the
   * parent (task panel) can warn before closing and losing them.
   */
  onEditingDirtyChange?: (dirty: boolean) => void;
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
  onEdit,
  onToggle,
  onDelete,
  onEditingDirtyChange,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // An inline edit is "dirty" while it's open and the text differs from the
  // saved subtask title. Reported upward so the task panel can warn before a
  // close discards it.
  const editingOriginalTitle = editingId
    ? subtasks.find((subtask) => subtask.id === editingId)?.title ?? ''
    : '';
  const isEditingDirty = editingId !== null
    && editingTitle.trim() !== editingOriginalTitle.trim();

  useEffect(() => {
    onEditingDirtyChange?.(isEditingDirty);
    return () => onEditingDirtyChange?.(false);
  }, [isEditingDirty, onEditingDirtyChange]);

  const startEditing = (subtaskId: string, title: string) => {
    setEditingId(subtaskId);
    setEditingTitle(title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const commitEditing = async (subtaskId: string) => {
    const saved = await onEdit(subtaskId, editingTitle);
    if (saved) cancelEditing();
  };

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

      <div className="flex items-start gap-2">
        <Textarea
          ref={subtaskInputRef}
          value={newSubtaskTitle}
          onChange={(event) => onNewTitleChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the subtask; Shift+Enter inserts a newline.
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            onAdd();
          }}
          rows={2}
          placeholder={t`Subtask title`}
          disabled={isReadOnly || subtasksSaving}
          className="min-h-[56px] flex-1 resize-y text-sm"
        />
        <Button
          type="button"
          className="h-8 shrink-0 px-3 text-xs"
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
                disabled={isReadOnly || editingId === subtask.id}
              />
              {editingId === subtask.id ? (
                <Textarea
                  autoFocus
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter saves; Shift+Enter inserts a newline.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void commitEditing(subtask.id);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelEditing();
                    }
                  }}
                  onBlur={() => void commitEditing(subtask.id)}
                  disabled={isReadOnly}
                  rows={2}
                  className="min-h-[56px] flex-1 resize-y text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isReadOnly) return;
                    startEditing(subtask.id, subtask.title);
                  }}
                  disabled={isReadOnly}
                  className={cn(
                    'flex-1 whitespace-pre-wrap break-words text-left text-sm leading-snug text-foreground [overflow-wrap:anywhere]',
                    !isReadOnly && 'cursor-text',
                    subtask.isDone && 'line-through text-muted-foreground',
                  )}
                >
                  {subtask.title}
                </button>
              )}
              {editingId !== subtask.id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => startEditing(subtask.id, subtask.title)}
                  disabled={isReadOnly}
                  aria-label={t`Edit subtask`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
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
