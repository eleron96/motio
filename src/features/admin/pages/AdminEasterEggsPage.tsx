import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminStore } from '@/features/admin/store/adminStore';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { useTablePagination } from '@/features/admin/hooks/useTablePagination';
import { AdminTablePagination } from '@/features/admin/components/AdminTablePagination';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useShallow } from 'zustand/react/shallow';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { EGG_CATALOG } from '@/features/daily-brief/easter-eggs/catalog';
import { formatDateCompact, shortId } from '@/features/admin/lib/format';
import { AdminUserPicker, type PickableUser } from '@/features/admin/components/AdminUserPicker';
import {
  audienceSummary,
  draftAudienceValue,
  easterEggStatus,
  emptyEasterEggDraft,
  endOfDay,
  isEasterEggDraftReady,
  startOfDay,
  type EasterEggAudienceKind,
  type EasterEggDraft,
  type EasterEggStatus,
  type EasterEggTarget,
} from '@/features/admin/lib/easterEggAudience';

// Effects live in the daily-brief catalog; this page only manages assignments.
// An assignment addresses one person or a whole audience — a mail domain, a
// workspace, or everyone — so a company-wide egg is one row rather than one per
// head. The resolver prefers the most specific audience, so a broad egg never
// overrides the eggs individuals already have.
const EGG_KEYS = Object.keys(EGG_CATALOG);

const AdminEasterEggsPage: React.FC = () => {
  const { adminWorkspaces, fetchAdminWorkspaces } = useAdminStore(
    useShallow((state) => ({
      adminWorkspaces: state.adminWorkspaces,
      fetchAdminWorkspaces: state.fetchAdminWorkspaces,
    })),
  );
  // Its own roster rather than the store's: the users page deliberately hides
  // super admins, and here you have to be able to pick one — including yourself.
  const [people, setPeople] = useState<PickableUser[]>([]);
  const locale = useLocaleStore((state) => state.locale);

  const [targets, setTargets] = useState<EasterEggTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [draft, setDraft] = useState<EasterEggDraft>(() => emptyEasterEggDraft(EGG_KEYS[0] ?? ''));
  const [reach, setReach] = useState<number | null>(null);
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState('');

  const patchDraft = (patch: Partial<EasterEggDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const loadTargets = useCallback(async () => {
    setLoading(true);
    setListError('');
    const { data, error } = await invokeAdminFunction<{ targets?: EasterEggTarget[] }>({
      action: ADMIN_ACTIONS.EASTER_EGGS_LIST,
    });
    setLoading(false);
    if (error) {
      setListError(error);
      return;
    }
    setTargets(data?.targets ?? []);
  }, []);

  useEffect(() => {
    loadTargets();
    fetchAdminWorkspaces();
    void invokeAdminFunction<{ users?: PickableUser[] }>({
      action: ADMIN_ACTIONS.USERS_LIST,
      page: 1,
      perPage: 1000,
      loadAll: true,
      includeSuperAdmins: true,
    }).then(({ data }) => setPeople(data?.users ?? []));
  }, [loadTargets, fetchAdminWorkspaces]);

  const ready = isEasterEggDraftReady(draft);
  const audienceValue = draftAudienceValue(draft);

  // How many people the chosen audience covers — the difference between "one
  // person" and "everyone" is worth seeing before saving.
  useEffect(() => {
    if (!ready || draft.audienceKind === 'user') {
      setReach(draft.audienceKind === 'user' && ready ? 1 : null);
      return;
    }
    let active = true;
    void invokeAdminFunction<{ count?: number }>({
      action: ADMIN_ACTIONS.EASTER_EGGS_AUDIENCE,
      audienceKind: draft.audienceKind,
      ...(audienceValue ? { audienceValue } : {}),
    }).then(({ data }) => {
      if (active) setReach(data?.count ?? 0);
    });
    return () => { active = false; };
  }, [ready, draft.audienceKind, audienceValue]);

  const pagination = useTablePagination(targets, 'easter-eggs');

  const sortedUsers = useMemo(
    () => [...people].sort((left, right) => (left.email ?? '').localeCompare(right.email ?? '')),
    [people],
  );

  const handleAssign = async () => {
    if (!ready) {
      setSaveError(t`Pick an egg and who it is for.`);
      return;
    }
    setSaveSubmitting(true);
    setSaveError('');
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.EASTER_EGGS_SAVE,
      eggKey: draft.eggKey,
      audienceKind: draft.audienceKind,
      ...(draft.audienceKind === 'user' ? { userId: draft.userId } : {}),
      ...(audienceValue ? { audienceValue } : {}),
      enabled: true,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      ...(draft.startsAt ? { startsAt: startOfDay(draft.startsAt) } : {}),
      ...(draft.endsAt ? { endsAt: endOfDay(draft.endsAt) } : {}),
    });
    setSaveSubmitting(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setDraft(emptyEasterEggDraft(draft.eggKey));
    await loadTargets();
  };

  const saveTarget = async (target: EasterEggTarget, changes: { eggKey?: string; enabled?: boolean }) => {
    setRowActionId(target.id);
    setRowActionError('');
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.EASTER_EGGS_SAVE,
      id: target.id,
      eggKey: changes.eggKey ?? target.eggKey,
      audienceKind: target.audienceKind,
      ...(target.audienceKind === 'user' && target.userId ? { userId: target.userId } : {}),
      ...(target.audienceValue ? { audienceValue: target.audienceValue } : {}),
      enabled: changes.enabled ?? target.enabled,
      ...(target.note ? { note: target.note } : {}),
      startsAt: target.startsAt,
      endsAt: target.endsAt,
    });
    setRowActionId(null);
    if (error) {
      setRowActionError(error);
      return;
    }
    await loadTargets();
  };

  const handleToggle = (target: EasterEggTarget, enabled: boolean) => saveTarget(target, { enabled });

  const handleChangeKey = (target: EasterEggTarget, eggKey: string) => {
    if (eggKey === target.eggKey) return Promise.resolve();
    return saveTarget(target, { eggKey });
  };

  const handleDelete = async (target: EasterEggTarget) => {
    setRowActionId(target.id);
    setRowActionError('');
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.EASTER_EGGS_DELETE,
      id: target.id,
    });
    setRowActionId(null);
    if (error) {
      setRowActionError(error);
      return;
    }
    await loadTargets();
  };

  const audienceLabels = {
    everyone: t`Everyone`,
    unknownWorkspace: t`Unknown workspace`,
    unknownUser: t`Unknown user`,
  };

  const statusLabels: Record<EasterEggStatus, string> = {
    off: t`Off`,
    scheduled: t`Scheduled`,
    live: t`Live`,
    finished: t`Finished`,
  };

  const windowLabel = (target: EasterEggTarget) => {
    if (!target.startsAt && !target.endsAt) return t`Always`;
    const from = target.startsAt ? formatDateCompact(target.startsAt, locale) : '…';
    const to = target.endsAt ? formatDateCompact(target.endsAt, locale) : '…';
    return `${from} – ${to}`;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">{t`Assign an easter egg`}</div>
          {reach !== null && (
            <div className="text-xs text-muted-foreground">{t`Reaches ${reach} people`}</div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{t`Egg`}</Label>
            <Select value={draft.eggKey} onValueChange={(eggKey) => patchDraft({ eggKey })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EGG_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>{key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t`Audience`}</Label>
            <Select
              value={draft.audienceKind}
              onValueChange={(value) => patchDraft({ audienceKind: value as EasterEggAudienceKind })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t`One person`}</SelectItem>
                <SelectItem value="domain">{t`Email domain`}</SelectItem>
                <SelectItem value="workspace">{t`Workspace`}</SelectItem>
                <SelectItem value="all_active">{t`Everyone`}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 lg:col-span-2">
            <Label>{t`Who`}</Label>
            {draft.audienceKind === 'user' && (
              <AdminUserPicker
                users={sortedUsers}
                value={draft.userId}
                onChange={(userId) => patchDraft({ userId })}
              />
            )}
            {draft.audienceKind === 'domain' && (
              <Input
                placeholder="example.com"
                value={draft.domain}
                onChange={(event) => patchDraft({ domain: event.target.value })}
              />
            )}
            {draft.audienceKind === 'workspace' && (
              <Select value={draft.workspaceId} onValueChange={(workspaceId) => patchDraft({ workspaceId })}>
                <SelectTrigger><SelectValue placeholder={t`Select workspace`} /></SelectTrigger>
                <SelectContent>
                  {adminWorkspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {draft.audienceKind === 'all_active' && (
              <p className="text-xs text-muted-foreground">
                {t`Every active account, including people who join later.`}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="egg-starts-at">{t`Show from`}</Label>
            <Input
              id="egg-starts-at"
              type="date"
              value={draft.startsAt}
              onChange={(event) => patchDraft({ startsAt: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="egg-ends-at">{t`Show until`}</Label>
            <Input
              id="egg-ends-at"
              type="date"
              value={draft.endsAt}
              onChange={(event) => patchDraft({ endsAt: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="egg-note">{t`Note`}</Label>
            <Input
              id="egg-note"
              value={draft.note}
              onChange={(event) => patchDraft({ note: event.target.value })}
              placeholder={t`Optional`}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={() => void handleAssign()}
              disabled={saveSubmitting || !ready}
              className="w-full sm:w-auto"
            >
              {t`Assign`}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t`Leave the dates empty to switch it on now and off by hand. A personal assignment wins over a workspace one, which wins over a domain, which wins over everyone.`}
        </p>

        {saveError && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
      </div>

      {listError && (
        <Alert variant="destructive">
          <AlertTitle>{t`Error`}</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      )}
      {rowActionError && (
        <Alert variant="destructive">
          <AlertTitle>{t`Error`}</AlertTitle>
          <AlertDescription>{rowActionError}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="py-6 text-sm text-muted-foreground">{t`Loading easter eggs...`}</div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t`Audience`}</TableHead>
                  <TableHead>{t`Egg`}</TableHead>
                  <TableHead>{t`Status`}</TableHead>
                  <TableHead>{t`Window`}</TableHead>
                  <TableHead>{t`Note`}</TableHead>
                  <TableHead>{t`Active`}</TableHead>
                  <TableHead className="text-right">{t`Actions`}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      {t`No easter eggs assigned.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.pageRows.map((target) => {
                    const status = easterEggStatus(target);
                    return (
                      <TableRow key={target.id}>
                        <TableCell className="font-medium">
                          <div className="max-w-[220px] truncate">
                            {audienceSummary(target, audienceLabels)}
                          </div>
                          <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {target.audienceKind === 'user'
                              ? target.userEmail ?? (target.userId ? shortId(target.userId) : '')
                              : target.audienceKind === 'domain'
                                ? t`Email domain`
                                : target.audienceKind === 'workspace'
                                  ? t`Workspace`
                                  : t`Everyone`}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Select
                            value={target.eggKey}
                            onValueChange={(key) => void handleChangeKey(target, key)}
                            disabled={rowActionId === target.id}
                          >
                            <SelectTrigger className="h-8 w-[190px]" aria-label={t`Change easter egg`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EGG_KEYS.map((key) => (
                                <SelectItem key={key} value={key}>{key}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status === 'live' ? 'default' : 'secondary'}>
                            {statusLabels[status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{windowLabel(target)}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                          {target.note ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={target.enabled}
                            disabled={rowActionId === target.id}
                            onCheckedChange={(checked) => void handleToggle(target, checked)}
                            aria-label={t`Toggle easter egg`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDelete(target)}
                            disabled={rowActionId === target.id}
                          >
                            {t`Delete`}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <AdminTablePagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            pageSize={pagination.pageSize}
            total={pagination.total}
            firstRow={pagination.firstRow}
            lastRow={pagination.lastRow}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      )}
    </div>
  );
};

export default AdminEasterEggsPage;
