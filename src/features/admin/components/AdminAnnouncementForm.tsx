import React, { useCallback, useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { formatDate } from '@/features/admin/lib/format';
import { useLocaleStore } from '@/shared/store/localeStore';

type Level = 'info' | 'critical';
type AudienceKind = 'all_active' | 'domain' | 'workspace';

interface AnnouncementRow {
  id: string;
  title: string;
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

/**
 * The in-app half of the broadcast page: an announcement shown inside the
 * product instead of sent by mail.
 *
 * Everyone sees it once — dismissal is recorded per person server-side — so the
 * only delivery signal worth showing here is how many people closed it.
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

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [historyError, setHistoryError] = useState('');

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

  const publish = async () => {
    if (!titleRu.trim() || !audienceReady) return;
    setPublishing(true);
    setError('');

    const { error: publishError } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.ANNOUNCEMENTS_PUBLISH,
      titleRu: titleRu.trim(),
      ...(titleEn.trim() ? { titleEn: titleEn.trim() } : {}),
      ...(bodyRu.trim() ? { bodyRu: bodyRu.trim() } : {}),
      ...(bodyEn.trim() ? { bodyEn: bodyEn.trim() } : {}),
      level,
      audienceKind,
      ...(audienceKind === 'domain' ? { audienceValue: domain.trim() } : {}),
      ...(audienceKind === 'workspace' ? { audienceValue: workspaceId } : {}),
      // A date input gives a day; show it until the end of that day.
      ...(endsAt ? { endsAt: new Date(`${endsAt}T23:59:59`).toISOString() } : {}),
    });

    setPublishing(false);
    if (publishError) {
      setError(publishError);
      return;
    }

    setTitleRu('');
    setTitleEn('');
    setBodyRu('');
    setBodyEn('');
    setEndsAt('');
    await loadHistory();
  };

  const unpublish = async (id: string) => {
    await invokeAdminFunction({ action: ADMIN_ACTIONS.ANNOUNCEMENTS_UNPUBLISH, announcementId: id });
    await loadHistory();
  };

  const audienceLabel = (row: AnnouncementRow) => {
    if (row.audienceKind === 'all_active') return t`All active users`;
    if (row.audienceKind === 'domain') return row.audienceValue ?? '';
    return workspaces.find((workspace) => workspace.id === row.audienceValue)?.name
      ?? row.audienceValue
      ?? '';
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-4">
        <div className="text-sm font-semibold">{t`New announcement`}</div>

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

        <Button onClick={() => void publish()} disabled={publishing || !titleRu.trim() || !audienceReady}>
          {t`Publish`}
        </Button>
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
                <TableHead>{t`Level`}</TableHead>
                <TableHead>{t`Audience`}</TableHead>
                <TableHead>{t`Dismissed`}</TableHead>
                <TableHead>{t`Until`}</TableHead>
                <TableHead className="text-right">{t`Actions`}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    {t`No announcements yet.`}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[280px] truncate">{row.title}</TableCell>
                  <TableCell>{row.level === 'critical' ? t`Important` : t`Banner`}</TableCell>
                  <TableCell>{audienceLabel(row)}</TableCell>
                  <TableCell className="tabular-nums">{row.dismissedCount}</TableCell>
                  <TableCell>{row.endsAt ? formatDate(row.endsAt, locale) : '—'}</TableCell>
                  <TableCell className="text-right">
                    {row.published && (
                      <Button size="sm" variant="outline" onClick={() => void unpublish(row.id)}>
                        {t`Unpublish`}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
