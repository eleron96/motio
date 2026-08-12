import { useCallback, useEffect, useRef } from 'react';
import { plural, t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { TaskUndoEntry } from '@/shared/domain/taskUndo';

const UNDO_TOAST_DURATION_MS = 6000;

const entryLabel = (entry: TaskUndoEntry): string => {
  switch (entry.kind) {
    case 'resize':
      return t`Task dates changed`;
    case 'series-move':
      return plural(entry.rows.length, {
        one: 'Series moved (# task)',
        other: 'Series moved (# tasks)',
      });
    case 'quick-edit': {
      const columns = Object.keys(entry.rows[0]?.restore ?? {});
      if (columns.includes('status_id')) return t`Status changed`;
      if (columns.includes('priority')) return t`Priority changed`;
      if (columns.includes('project_id')) return t`Project changed`;
      return t`Task updated`;
    }
    case 'delete':
      return t`Task deleted`;
    // The user asked to move "only this task" — the detach part is plumbing,
    // so the toast reads the same as a plain move.
    case 'detach-move':
    case 'move':
    default:
      return t`Task moved`;
  }
};

/**
 * Timeline undo UI: an action toast for every recorded mutation plus a
 * Cmd/Ctrl+Z hotkey for the most recent one. Mounted once on PlannerPage.
 */
export const useTaskUndoToasts = () => {
  // Ids we have already toasted. An id is forgotten when its entry leaves the
  // stack (undone, committed, workspace switch) — at that moment the toast is
  // also dismissed, so a stale "Undo" button can never outlive its entry.
  const shownEntryIds = useRef<Set<string>>(new Set());
  const stack = usePlannerStore((state) => state.taskUndoStack);

  const undoWithFeedback = useCallback(async (entryId?: string) => {
    const store = usePlannerStore.getState();
    const outcome = entryId
      ? await store.undoTaskEntry(entryId)
      : await store.undoLastTask();

    if (!outcome) {
      // Только для клика по тосту: Cmd+Z с пустым стеком сюда не доходит.
      if (entryId) toast(t`Already undone`);
      return;
    }
    if (outcome.failed > 0) {
      toast.error(t`Couldn't undo — try again`);
      return;
    }
    if (outcome.restored === 0) {
      toast(t`Couldn't undo — the task was already changed`);
      return;
    }
    if (outcome.stale > 0) {
      toast(t`Undone partially (${outcome.restored} of ${outcome.total})`);
      return;
    }
    toast(t`Undone`);
  }, []);

  useEffect(() => {
    const aliveIds = new Set(stack.map((entry) => entry.id));

    // Запись покинула стек (отменена, коммит удаления, смена воркспейса) —
    // её тост с кнопкой «Отменить» больше не имеет силы и гасится. Это же
    // закрывает «замороженный ховером» тост, переживший 7s-окно удаления.
    for (const id of [...shownEntryIds.current]) {
      if (!aliveIds.has(id)) {
        toast.dismiss(id);
        shownEntryIds.current.delete(id);
      }
    }

    const head = stack[0];
    if (!head || shownEntryIds.current.has(head.id)) return;
    shownEntryIds.current.add(head.id);
    const entryId = head.id;
    toast(entryLabel(head), {
      id: entryId,
      action: {
        label: t`Undo`,
        onClick: () => { void undoWithFeedback(entryId); },
      },
      duration: UNDO_TOAST_DURATION_MS,
    });
  }, [stack, undoWithFeedback]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      // e.code is layout-independent: on the RU layout the same key reports
      // key 'я', which would never match a 'z' check.
      if (event.code !== 'KeyZ') return;
      if (usePlannerStore.getState().taskUndoStack.length === 0) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
      // While a dialog is open (task panel, repeat scope…) Cmd+Z belongs to
      // the dialog's own editing context, not the timeline.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;

      event.preventDefault();
      void undoWithFeedback();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoWithFeedback]);
};
