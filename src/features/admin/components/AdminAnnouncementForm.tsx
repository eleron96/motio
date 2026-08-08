import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
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

type Level = 'info' | 'critical';
type AudienceKind = 'all_active' | 'domain' | 'workspace';

interface AnnouncementRow {
  id: string;
  title: string;
  titleEn: string | null;
  bodyRu: string | null;
  bodyEn: string | null;
  level: Level;
  audienceKind: AudienceKind;
  audienceValue: string | null;
  published: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  dismissedCount: number;
}

interface AdminAnnouncementFormProps {
  workspaces: Array<{ id: string; name: string }>;
}

/** A `date` input speaks days; the window itself is stored to the second. */
const toDateInput = (value: string | null): string => (value ? value.slice(0, 10) : '');
const startOfDay = (day: string): string => new Date(`${day}T00:00:00`).toISOString();
const endOfDay = (day: string): string => new Date(`${day}T23:59:59`).toISOString();
const todayInput = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

type RowStatus = 'draft' | 'scheduled' | 'live' | 'expired';

const rowStatus = (row: AnnouncementRow): RowStatus => {
  if (!row.published) return 'draft';
  const now = Date.now();
  if (new Date(row.startsAt).getTime() > now) return 'scheduled';
  if (row.endsAt && new Date(row.endsAt).getTime() < now) return 'expired';
  return 'live';
};

/**
 * The in-app half of the broadcast page: an announcement shown inside the
 * product instead of sent by mail.
 *
 * Everyone sees it once — dismissal is recorded per person server-side — so the
 * only delivery signal worth showing here is how many people closed it. That
 * same record is why re-publishing offers to clear the dismissals: without it a
 * corrected announcement stays invisible to everyone who closed the old one.
 */
export const AdminAnnouncementForm: React.FC<AdminAnnouncementFormProps> = ({ workspaces }) => {
  const locale = useLocaleStore((state) => state.locale);

  const [level, setLevel] = useState<Level>('info');
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('all_active');
  const [domain, setDomain] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [titleRu, setTitleRu] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [bodyRu, setBodyRu] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [historyError, setHistoryError] = useState('');

  const [republishRow, setRepublishRow] = useState<AnnouncementRow | null>(null);
  const [republishFrom, setRepublishFrom] = useState('');
  const [republishUntil, setRepublishUntil] = useState('');
  const [republishResetReads, setRepublishResetReads] = useState(true);
  const [confirming, setConfirming] = useState<{ kind: 'delete' | 'resetReads'; row: AnnouncementRow } | null>(null);

  const formRef = useRef<HTMLDivElement | null>(null);

  const loadHistory = useCallback(async () => {
    const { data, error: listError } = await invokeAdminFunction<{ announcements?: AnnouncementRow[] }>({
      action: ADMIN_ACTIONS.ANNOUNCEMENTS_LIST,
    });
    if (listError) {
      setHistoryError(listError);
      return;
    }
    setHistoryError('');
    setRows(data?.announcements ?? []);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const audienceReady = audienceKind === 'all_active'
    || (audienceKind === 'domain' ? domain.trim().length > 0 : workspaceId.length > 0);

  const resetForm = () => {
    setEditingId(null);
    setLevel('info');
    setAudienceKind('all_active');
    setDomain('');
    setWorkspaceId('');
    setTitleRu('');
    setTitleEn('');
    setBodyRu('');
    setBodyEn('');
    setEndsAt('');
    setError('');
  };

  const fillForm = (row: AnnouncementRow) => {
    setLevel(row.level);
    setAudienceKind(row.audienceKind);
    setDomain(row.audienceKind === 'domain' ? row.audienceValue ?? '' : '');
    setWorkspaceId(row.audienceKind === 'workspace' ? row.audienceValue ?? '' : '');
    setTitleRu(row.title);
    setTitleEn(row.titleEn ?? '');
    setBodyRu(row.bodyRu ?? '');
    setBodyEn(row.bodyEn ?? '');
    setEndsAt(toDateInput(row.endsAt));
    setError('');
    formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const startEditing = (row: AnnouncementRow) => {
    setEditingId(row.id);
    fillForm(row);
  };

  /** Duplicating keeps the wording but leaves the original untouched. */
  const startDuplicate = (row: AnnouncementRow) => {
    setEditingId(null);
    fillForm(row);
  };

  const audienceValue = () => {
    if (audienceKind === 'domain') return domain.trim();
    if (audienceKind === 'workspace') return workspaceId;
    return null;
  };

  const submit = async (published: boolean) => {
    if (!titleRu.trim() || !audienceReady) return;
    setPublishing(true);
    setError('');

    const { error: submitError } = editingId
      ? await invokeAdminFunction({
        action: ADMIN_ACTIONS.ANNOUNCEMENTS_UPDATE,
        announcementId: editingId,
        titleRu: titleRu.trim(),
        titleEn: titleEn.trim(),
        bodyRu: bodyRu.trim(),
        bodyEn: bodyEn.trim(),
        level,
        audienceKind,
        audienceValue: audienceValue(),
        endsAt: endsAt ? endOfDay(endsAt) : null,
      })
      : await invokeAdminFunction({
        action: ADMIN_ACTIONS.ANNOUNCEMENTS_PUBLISH,
        titleRu: titleRu.trim(),
        ...(titleEn.trim() ? { titleEn: titleEn.trim() } : {}),
        ...(bodyRu.trim() ? { bodyRu: bodyRu.trim() } : {}),
        ...(bodyEn.trim() ? { bodyEn: bodyEn.trim() } : {}),
        level,
        audienceKind,
        ...(audienceKind === 'all_active' ? {} : { audienceValue: audienceValue() as string }),
        ...(endsAt ? { endsAt: endOfDay(endsAt) } : {}),
        published,
      });

    setPublishing(false);
    if (submitError) {
      setError(submitError);
      return;
    }

    resetForm();
    await loadHistory();
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
    await loadHistory();
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
    await loadHistory();
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
    if (kind === 'delete' && editingId === row.id) resetForm();
    setHistoryError('');
    await loadHistory();
  };

  const audienceLabel = (row: AnnouncementRow) => {
    if (row.audienceKind === 'all_active') return t`All active users`;
    if (row.audienceKind === 'domain') return row.audienceValue ?? '';
    return workspaces.find((workspace) => workspace.id === row.audienceValue)?.name
      ?? row.audienceValue
      ?? '';
  };

  const statusLabels: Record<RowStatus, string> = {
    draft: t`Draft`,
    scheduled: t`Scheduled`,
    live: t`Live`,
    expired: t`Finished`,
  };

  const editing = editingId !== null;

  return (
    <div className="space-y-4">
      <div ref={formRef} className="rounded-md border p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">
            {editing ? t`Edit announcement` : t`New announcement`}
          </div>
          {editing && (
            <Button size="sm" variant="ghost" onClick={resetForm}>{t`Cancel`}</Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t`Level`}</Label>
            <SegmentedControl>
              <SegmentedControlItem active={level === 'info'} onClick={() => setLevel('info')}>
                {t`Banner`}
              </SegmentedControlItem>
              <SegmentedControlItem active={level === 'critical'} onClick={() => setLevel('critical')}>
                {t`Important`}
              </SegmentedControlItem>
            </SegmentedControl>
            <p className="text-xs text-muted-foreground">
              {level === 'info'
                ? t`A strip above the workspace that can be dismissed.`
                : t`Interrupts once with a dialog. Use for maintenance and outages.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t`Audience`}</Label>
            <Select value={audienceKind} onValueChange={(value) => setAudienceKind(value as AudienceKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all_active">{t`All active users`}</SelectItem>
                <SelectItem value="domain">{t`Email domain`}</SelectItem>
                <SelectItem value="workspace">{t`Workspace`}</SelectItem>
              </SelectContent>
            </Select>
            {audienceKind === 'domain' && (
              <Input
                placeholder="example.com"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
              />
            )}
            {audienceKind === 'workspace' && (
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger><SelectValue placeholder={t`Select a workspace`} /></SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t`Title (RU)`}</Label>
            <Input value={titleRu} onChange={(event) => setTitleRu(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t`Title (EN)`}</Label>
            <Input
              value={titleEn}
              onChange={(event) => setTitleEn(event.target.value)}
              placeholder={t`Leave empty to reuse the Russian text`}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t`Text (RU)`}</Label>
            <Textarea rows={4} value={bodyRu} onChange={(event) => setBodyRu(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t`Text (EN)`}</Label>
            <Textarea rows={4} value={bodyEn} onChange={(event) => setBodyEn(event.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5 sm:max-w-[220px]">
          <Label>{t`Show until`}</Label>
          <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          <p className="text-xs text-muted-foreground">
            {t`Empty means it stays until each person dismisses it.`}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void submit(true)}
            disabled={publishing || !titleRu.trim() || !audienceReady}
          >
            {editing ? t`Save` : t`Publish`}
          </Button>
          {!editing && (
            <Button
              variant="outline"
              onClick={() => void submit(false)}
              disabled={publishing || !titleRu.trim() || !audienceReady}
            >
              {t`Save as draft`}
            </Button>
          )}
        </div>
        {editing && (
          <p className="text-xs text-muted-foreground">
            {t`Editing does not bring the announcement back to people who already closed it — use "Show again to everyone" for that.`}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">{t`History`}</div>
        {historyError && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{historyError}</AlertDescription>
          </Alert>
        )}
        <div className="rounded-md border">
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
                const status = rowStatus(row);
                return (
                  <TableRow key={row.id} className={editingId === row.id ? 'bg-muted/50' : undefined}>
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
                          <DropdownMenuItem onSelect={() => startEditing(row)}>
                            {t`Edit`}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => startDuplicate(row)}>
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

      <Dialog open={republishRow !== null} onOpenChange={(open) => { if (!open) setRepublishRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Publish again`}</DialogTitle>
            <DialogDescription>{republishRow?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t`Show from`}</Label>
              <Input
                type="date"
                value={republishFrom}
                onChange={(event) => setRepublishFrom(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t`A future date schedules it.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t`Show until`}</Label>
              <Input
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
