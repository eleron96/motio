import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { Pencil, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceClosuresStore } from '@/features/planner/store/workspaceClosuresStore';
import {
  closureInputProblem,
  sortClosures,
  type ClosureInputProblem,
  type WorkspaceClosure,
} from '@/shared/domain/workspaceClosures';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
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
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { toast } from '@/shared/ui/sonner';
import { Block } from '@/features/workspace/components/settingsBlocks';

interface WorkspaceClosuresSettingsProps {
  workspaceId: string;
  isAdmin: boolean;
}

const problemText = (problem: ClosureInputProblem) => {
  switch (problem) {
    case 'name': return t`Give the days off a name, up to 80 characters.`;
    case 'dates': return t`Pick the first and the last day; the last cannot come before the first.`;
    case 'too_long': return t`A closure can be a year long at most.`;
  }
};

const EMPTY_FORM = { name: '', startDate: '', endDate: '' };

/**
 * Settings → General, with the server setting workspaces.closures on: days off
 * for the whole workspace (a company closure, collective leave). They show
 * like public holidays on the timeline, in the calendar and in the workload
 * heatmap. Nobody's own time off changes.
 */
export const WorkspaceClosuresSettings: React.FC<WorkspaceClosuresSettingsProps> = ({ workspaceId, isAdmin }) => {
  const { closures, load, create, update, remove } = useWorkspaceClosuresStore(useShallow((state) => ({
    closures: state.byWorkspace[workspaceId],
    load: state.load,
    create: state.create,
    update: state.update,
    remove: state.remove,
  })));
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const todayIso = useTodayKey();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceClosure | null>(null);

  useEffect(() => {
    void load(workspaceId, { force: true });
  }, [workspaceId, load]);

  const sorted = useMemo(() => sortClosures(closures ?? [], todayIso), [closures, todayIso]);

  const formatRange = (closure: WorkspaceClosure) => {
    const start = format(parseISO(closure.startDate), 'd MMM yyyy', { locale: dateLocale });
    if (closure.startDate === closure.endDate) return start;
    const end = format(parseISO(closure.endDate), 'd MMM yyyy', { locale: dateLocale });
    return `${start} – ${end}`;
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async () => {
    const input = { ...form, endDate: form.endDate || form.startDate };
    const problem = closureInputProblem(input);
    if (problem) {
      setFormError(problemText(problem));
      return;
    }
    setSaving(true);
    const result = editingId ? await update(workspaceId, editingId, input) : await create(workspaceId, input);
    setSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    toast.success(editingId ? t`Days off updated.` : t`Days off added.`);
    resetForm();
  };

  const startEditing = (closure: WorkspaceClosure) => {
    setEditingId(closure.id);
    setForm({ name: closure.name, startDate: closure.startDate, endDate: closure.endDate });
    setFormError('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const result = await remove(workspaceId, target.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (editingId === target.id) resetForm();
  };

  return (
    <Block
      title={t`Days off for everyone`}
      description={t`A company closure or collective leave: these days show like public holidays on the timeline, in the calendar and in the workload heatmap. Nobody's own time off changes.`}
    >
      {sorted.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {sorted.map((closure) => (
            <li key={closure.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{closure.name}</p>
                <p className="text-xs text-muted-foreground">{formatRange(closure)}</p>
              </div>
              {isAdmin && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => startEditing(closure)}
                    aria-label={t`Edit ${closure.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(closure)}
                    aria-label={t`Delete ${closure.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t`No days off for everyone yet.`}</p>
      )}

      {isAdmin && (
        <div className="space-y-3 rounded-md border border-dashed p-3">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-closure-name">{t`Name`}</Label>
            <Input
              id="workspace-closure-name"
              value={form.name}
              maxLength={80}
              placeholder={t`Winter closure`}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="workspace-closure-start">{t`First day`}</Label>
              <Input
                id="workspace-closure-start"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workspace-closure-end">{t`Last day`}</Label>
              <Input
                id="workspace-closure-end"
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              />
            </div>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
              {editingId ? t`Save changes` : t`Add days off`}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                {t`Cancel`}
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete these days off?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? t`${deleteTarget.name} (${formatRange(deleteTarget)}) become ordinary days again.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Block>
  );
};
