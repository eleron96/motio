import React, { MutableRefObject, useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { TaskSubtask } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Textarea } from '@/shared/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { cn } from '@/shared/lib/classNames';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';

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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
        variant="ghost"
        className="h-8 w-fit gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={onOpen}
      >
        <Plus className="h-3.5 w-3.5" />
        {t`Add subtask`}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <ComposerEyebrow>
        {t`Subtasks`}
        {subtasks.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums tracking-normal">
            {completedSubtasksCount}/{subtasks.length}
          </span>
        )}
      </ComposerEyebrow>

      {subtasksError && (
        <div className="text-xs text-destructive">{subtasksError}</div>
      )}

      {subtasksLoading ? (
        <div className="text-xs text-muted-foreground">{t`Loading...`}</div>
      ) : subtasks.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t`No subtasks yet.`}</div>
      ) : (
        <div className="space-y-0.5">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="group flex items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted/60"
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
              {editingId !== subtask.id && !isReadOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label={t`Subtask actions`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onSelect={() => startEditing(subtask.id, subtask.title)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      {t`Edit`}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(event) => {
                        event.preventDefault();
                        setPendingDeleteId(subtask.id);
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      {t`Delete`}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {!isReadOnly && (
        <div className="flex items-start gap-2 pt-0.5">
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
            rows={1}
            placeholder={t`Subtask title`}
            disabled={subtasksSaving}
            className="min-h-[36px] flex-1 resize-y text-sm"
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 px-3 text-xs"
            onClick={onAdd}
            disabled={subtasksSaving || !newSubtaskTitle.trim()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t`Add`}
          </Button>
        </div>
      )}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete subtask?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) onDelete(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              {t`Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
