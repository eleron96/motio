import React, { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { i18n } from '@lingui/core';
import { ChevronDown } from 'lucide-react';
import { useIsDemo } from '@/features/demo/hooks/useIsDemo';
import { useTaskHistory, type TaskHistoryState } from '@/features/planner/hooks/useTaskHistory';
import { describeTaskHistoryEntry, type TaskHistoryNames } from '@/features/planner/lib/taskHistoryText';
import { rowNamesByUserId } from '@/features/planner/lib/personRowNames';
import { formatTimestampLabel } from '@/features/planner/lib/taskTimestamps';
import { groupTaskHistoryByDay } from '@/shared/domain/taskHistory';
import { useSheetDragDismiss } from '@/shared/hooks/useSheetDragDismiss';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { isSupportedLocale } from '@/shared/lib/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

interface NamedItem {
  id: string;
  name: string;
}

interface TaskHistoryButtonProps {
  taskId: string;
  updatedAt: string | undefined;
  /** The "Updated by … · today" line this button is made of. */
  label: string;
  isMobile: boolean;
  statuses: NamedItem[];
  projects: NamedItem[];
  /** People of the workspace; the ones with an account also name the authors. */
  assignees: Array<NamedItem & { userId?: string | null }>;
}

const nameLookup = (items: NamedItem[]) => {
  const names = new Map(items.map((item) => [item.id, item.name]));
  return (id: string) => names.get(id) ?? null;
};

const TaskHistoryList: React.FC<{ history: TaskHistoryState; names: TaskHistoryNames }> = ({ history, names }) => {
  const locale = resolveDateFnsLocale(isSupportedLocale(i18n.locale) ? i18n.locale : 'en');
  const now = new Date();

  if (history.status === 'idle' || history.status === 'loading') {
    return <p className="text-sm text-muted-foreground">{t`Loading…`}</p>;
  }
  if (history.status === 'error') {
    return <p className="text-sm text-muted-foreground">{t`Couldn't load the history`}</p>;
  }
  if (history.entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t`No changes recorded yet`}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groupTaskHistoryByDay(history.entries).map((day) => (
        <section key={day.day}>
          <h3 className="mb-1 text-xs font-normal text-muted-foreground first-letter:uppercase">
            {formatTimestampLabel(day.entries[0].at, now, locale)}
          </h3>
          <ul className="flex flex-col gap-2">
            {day.entries.map((entry) => {
              const line = describeTaskHistoryEntry(entry, names, locale, now);
              const time = format(parseISO(entry.at), 'HH:mm');
              return (
                <li key={entry.id} className="min-w-0">
                  <p className="break-words text-sm leading-5 text-foreground [overflow-wrap:anywhere]">
                    {line.title}
                  </p>
                  <p className="break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                    {line.detail ? `${line.detail} · ${time}` : time}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {history.hiddenCount > 0 && (
        <button
          type="button"
          onClick={history.showMore}
          className="press self-start rounded-sm text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t`Show ${history.hiddenCount} more`}
        </button>
      )}
    </div>
  );
};

/**
 * The card's "Updated by" line as the way into the task's history: a popover on
 * desktop, a bottom sheet on a phone. Nothing is loaded until it is opened.
 */
export const TaskHistoryButton: React.FC<TaskHistoryButtonProps> = ({
  taskId, updatedAt, label, isMobile, statuses, projects, assignees,
}) => {
  const isDemo = useIsDemo();
  const [open, setOpen] = useState(false);
  const history = useTaskHistory(taskId, open, updatedAt);
  const drag = useSheetDragDismiss(() => setOpen(false));

  const names = useMemo<TaskHistoryNames>(() => {
    const rowNames = rowNamesByUserId(assignees);
    return {
      // Only a live account falls back to its row; a removed one stays unnamed.
      actor: (id) => (id && id in history.actorNames
        ? history.actorNames[id] ?? rowNames.get(id) ?? null
        : null),
      status: nameLookup(statuses),
      project: nameLookup(projects),
      assignee: nameLookup(assignees),
    };
  }, [history.actorNames, statuses, projects, assignees]);

  // The sandbox keeps no history: the line stays plain text there.
  if (isDemo) return <p className="break-words [overflow-wrap:anywhere]">{label}</p>;

  const trigger = (
    <button
      type="button"
      onClick={isMobile ? () => setOpen(true) : undefined}
      className="press inline-flex max-w-full items-center gap-1 rounded-sm text-left underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{label}</span>
      <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span className="sr-only">{t`Change history`}</span>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            hideCloseButton
            className="max-h-[85svh] gap-0 overflow-y-auto overscroll-contain rounded-t-2xl p-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
            style={drag.style}
            {...drag.handlers}
          >
            <div className="sticky top-0 z-10 bg-background pt-2">
              <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-border" />
              <SheetHeader className="px-4 pb-3 pt-3 text-left">
                <SheetTitle className="text-base font-semibold">{t`Change history`}</SheetTitle>
                <SheetDescription className="sr-only">{label}</SheetDescription>
              </SheetHeader>
            </div>
            <div className="px-4 text-left">
              <TaskHistoryList history={history} names={names} />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* Not portalled: inside the card's dialog a portalled list cannot be scrolled with the wheel. */}
      <PopoverContent side="top" align="start" portalled={false} className="w-80 p-0">
        <p className="border-b px-3 py-2 text-sm font-medium text-foreground">{t`Change history`}</p>
        <div className="max-h-80 overflow-y-auto overscroll-contain p-3">
          <TaskHistoryList history={history} names={names} />
        </div>
      </PopoverContent>
    </Popover>
  );
};
