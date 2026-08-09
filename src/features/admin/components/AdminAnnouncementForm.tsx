import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/shared/ui/dialog';
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
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { formatDate } from '@/features/admin/lib/format';
import { useLocaleStore } from '@/shared/store/localeStore';
import { AnnouncementFields } from '@/features/admin/components/AnnouncementFields';
import { useAnnouncementHistory } from '@/features/admin/hooks/useAnnouncementHistory';
import {
  announcementStatus,
  draftAudienceValue,
  draftFromRow,
  emptyAnnouncementDraft,
  endOfDay,
  isAnnouncementDraftReady,
  startOfDay,
  toDateInput,
  todayInput,
  type AnnouncementDraft,
  type AnnouncementRow,
  type AnnouncementStatus,
} from '@/features/admin/lib/announcements';

interface AdminAnnouncementFormProps {
  workspaces: Array<{ id: string; name: string }>;
}

/**
 * The in-app half of the broadcast page: an announcement shown inside the
 * product instead of sent by mail.
 *
 * Everyone sees it once — dismissal is recorded per person server-side — so the
 * only delivery signal worth showing here is how many people closed it. That
 * same record is why re-publishing offers to clear the dismissals: without it a
 * corrected announcement stays invisible to everyone who closed the old one.
 *
 * Editing happens in a dialog rather than in the form above, so there is never
 * a doubt about whether the fields on screen are a new announcement or an old
 * one being changed.
 */
export const AdminAnnouncementForm: React.FC<AdminAnnouncementFormProps> = ({ workspaces }) => {
  const locale = useLocaleStore((state) => state.locale);
  const { rows, error: historyError, reload, setError: setHistoryError } = useAnnouncementHistory();

  const [draft, setDraft] = useState<AnnouncementDraft>(emptyAnnouncementDraft);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<{ row: AnnouncementRow; draft: AnnouncementDraft } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [republishRow, setRepublishRow] = useState<AnnouncementRow | null>(null);
  const [republishFrom, setRepublishFrom] = useState('');
  const [republishUntil, setRepublishUntil] = useState('');
  const [republishResetReads, setRepublishResetReads] = useState(true);
  const [confirming, setConfirming] = useState<{ kind: 'delete' | 'resetReads'; row: AnnouncementRow } | null>(null);

  const patchDraft = (patch: Partial<AnnouncementDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const patchEditDraft = (patch: Partial<AnnouncementDraft>) => setEditing((current) => (
    current ? { ...current, draft: { ...current.draft, ...patch } } : current
  ));

  const create = async (published: boolean) => {
    if (!isAnnouncementDraftReady(draft)) return;
    setPublishing(true);
    setError('');

    const audienceValue = draftAudienceValue(draft);
    const { error: createError } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.ANNOUNCEMENTS_PUBLISH,
      titleRu: draft.titleRu.trim(),
      ...(draft.titleEn.trim() ? { titleEn: draft.titleEn.trim() } : {}),
      ...(draft.bodyRu.trim() ? { bodyRu: draft.bodyRu.trim() } : {}),
      ...(draft.bodyEn.trim() ? { bodyEn: draft.bodyEn.trim() } : {}),
      level: draft.level,
      audienceKind: draft.audienceKind,
      ...(audienceValue ? { audienceValue } : {}),
      ...(draft.endsAt ? { endsAt: endOfDay(draft.endsAt) } : {}),
      published,
    });

    setPublishing(false);
    if (createError) {
      setError(createError);
      return;
    }
    setDraft(emptyAnnouncementDraft());
    await reload();
  };

  const saveEdit = async () => {
    if (!editing || !isAnnouncementDraftReady(editing.draft)) return;
    setSavingEdit(true);
    setEditError('');

    const { draft: edited, row } = editing;
    const { error: updateError } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE,
      announcementId: row.id,
      titleRu: edited.titleRu.trim(),
      titleEn: edited.titleEn.trim(),
      bodyRu: edited.bodyRu.trim(),
      bodyEn: edited.bodyEn.trim(),
      level: edited.level,
      audienceKind: edited.audienceKind,
      audienceValue: draftAudienceValue(edited),
      endsAt: edited.endsAt ? endOfDay(edited.endsAt) : null,
    });

    setSavingEdit(false);
    if (updateError) {
      setEditError(updateError);
      return;
    }
    setEditing(null);
    await reload();
  };

  const setPublished = async (row: AnnouncementRow, published: boolean) => {
    const { error: updateError } = await invokeAdminFunction({
      action: published ? ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE : ADMIN_ACTIONS.ANNOUNCEMENTS_UNPUBLISH,
      announcementId: row.id,
      ...(published ? { published: true } : {}),
    });
    if (updateError) {
      setHistoryError(updateError);
      return;
    }
    await reload();
  };

  const openRepublish = (row: AnnouncementRow) => {
    setRepublishRow(row);
    setRepublishFrom(todayInput());
    setRepublishUntil(toDateInput(row.endsAt));
    setRepublishResetReads(true);
  };

  const confirmRepublish = async () => {
    if (!republishRow) return;
    const target = republishRow;
    setRepublishRow(null);

    const { error: updateError } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE,
      announcementId: target.id,
      published: true,
      startsAt: startOfDay(republishFrom || todayInput()),
      endsAt: republishUntil ? endOfDay(republishUntil) : null,
    });
    if (updateError) {
      setHistoryError(updateError);
      return;
    }
    if (republishResetReads) {
      const { error: resetError } = await invokeAdminFunction({
        action: ADMIN_ACTIONS.ANNOUNCEMENTS_RESET_READS,
        announcementId: target.id,
      });
      if (resetError) {
        setHistoryError(resetError);
        return;
      }
    }
    setHistoryError('');
    await reload();
  };

  const confirmDestructive = async () => {
    if (!confirming) return;
    const { kind, row } = confirming;
    setConfirming(null);

    const { error: actionError } = await invokeAdminFunction({
      action: kind === 'delete' ? ADMIN_ACTIONS.ANNOUNCEMENTS_DELETE : ADMIN_ACTIONS.ANNOUNCEMENTS_RESET_READS,
      announcementId: row.id,
    });
    if (actionError) {
      setHistoryError(actionError);
      return;
    }
    if (kind === 'delete' && editing?.row.id === row.id) setEditing(null);
    setHistoryError('');
    await reload();
  };

  const audienceLabel = (row: AnnouncementRow) => {
    if (row.audienceKind === 'all_active') return t`All active users`;
    if (row.audienceKind === 'domain') return row.audienceValue ?? '';
    return workspaces.find((workspace) => workspace.id === row.audienceValue)?.name
      ?? row.audienceValue
      ?? '';
  };

  const statusLabels: Record<AnnouncementStatus, string> = {
    draft: t`Draft`,
    scheduled: t`Scheduled`,
    live: t`Live`,
    expired: t`Finished`,
  };

  const createReady = isAnnouncementDraftReady(draft);

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-4">
        <div className="text-sm font-semibold">{t`New announcement`}</div>

        <AnnouncementFields
          draft={draft}
          onChange={patchDraft}
          workspaces={workspaces}
          idPrefix="announcement-new"
        />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void create(true)} disabled={publishing || !createReady}>
            {t`Publish`}
          </Button>
          <Button variant="outline" onClick={() => void create(false)} disabled={publishing || !createReady}>
            {t`Save as draft`}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">{t`History`}</div>
        {historyError && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{historyError}</AlertDescription>
          </Alert>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t`Title`}</TableHead>
                <TableHead>{t`Status`}</TableHead>
                <TableHead>{t`Level`}</TableHead>
                <TableHead>{t`Audience`}</TableHead>
                <TableHead>{t`Dismissed`}</TableHead>
                <TableHead>{t`Until`}</TableHead>
                <TableHead className="w-[52px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    {t`No announcements yet.`}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const status = announcementStatus(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[280px] truncate">{row.title}</TableCell>
                    <TableCell>
                      <Badge variant={status === 'live' ? 'default' : 'secondary'}>
                        {statusLabels[status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.level === 'critical' ? t`Important` : t`Banner`}</TableCell>
                    <TableCell>{audienceLabel(row)}</TableCell>
                    <TableCell className="tabular-nums">{row.dismissedCount}</TableCell>
                    <TableCell>{row.endsAt ? formatDate(row.endsAt, locale) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={t`Actions`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditError('');
                              setEditing({ row, draft: draftFromRow(row) });
                            }}
                          >
                            {t`Edit`}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDraft(draftFromRow(row))}>
                            {t`Duplicate`}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openRepublish(row)}>
                            {t`Publish again…`}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={row.dismissedCount === 0}
                            onSelect={() => setConfirming({ kind: 'resetReads', row })}
                          >
                            {t`Show again to everyone`}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {row.published ? (
                            <DropdownMenuItem onSelect={() => void setPublished(row, false)}>
                              {t`Unpublish`}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => void setPublished(row, true)}>
                              {t`Publish`}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => setConfirming({ kind: 'delete', row })}
                          >
                            {t`Delete`}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogScrollContent className="space-y-4 p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t`Edit announcement`}</DialogTitle>
            <DialogDescription>
              {t`Editing does not bring the announcement back to people who already closed it — use "Show again to everyone" for that.`}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <AnnouncementFields
              draft={editing.draft}
              onChange={patchEditDraft}
              workspaces={workspaces}
              idPrefix="announcement-edit"
            />
          )}
          {editError && (
            <Alert variant="destructive">
              <AlertTitle>{t`Error`}</AlertTitle>
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t`Cancel`}</Button>
            <Button
              onClick={() => void saveEdit()}
              disabled={savingEdit || !editing || !isAnnouncementDraftReady(editing.draft)}
            >
              {t`Save`}
            </Button>
          </DialogFooter>
        </DialogScrollContent>
      </Dialog>

      <Dialog open={republishRow !== null} onOpenChange={(open) => { if (!open) setRepublishRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Publish again`}</DialogTitle>
            <DialogDescription>{republishRow?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="announcement-republish-from">{t`Show from`}</Label>
              <Input
                id="announcement-republish-from"
                type="date"
                value={republishFrom}
                onChange={(event) => setRepublishFrom(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t`A future date schedules it.`}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="announcement-republish-until">{t`Show until`}</Label>
              <Input
                id="announcement-republish-until"
                type="date"
                value={republishUntil}
                onChange={(event) => setRepublishUntil(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t`Empty means it stays until each person dismisses it.`}
              </p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={republishResetReads}
              onCheckedChange={(checked) => setRepublishResetReads(checked === true)}
            />
            <span>
              {t`Show it again to people who already closed it`}
              <span className="block text-xs text-muted-foreground">
                {t`Without this, only people who have not seen it yet will get it.`}
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRepublishRow(null)}>{t`Cancel`}</Button>
            <Button onClick={() => void confirmRepublish()}>{t`Publish again`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.kind === 'delete' ? t`Delete announcement?` : t`Show it to everyone again?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.kind === 'delete'
                ? t`The announcement and its delivery history will be gone for good.`
                : t`Everyone who already closed this announcement will see it once more.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDestructive()}>
              {confirming?.kind === 'delete' ? t`Delete` : t`Show again`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
