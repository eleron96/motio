import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminStore } from '@/features/admin/store/adminStore';
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

interface EasterEggTarget {
  id: string;
  eggKey: string;
  userId: string;
  userEmail: string | null;
  userDisplayName: string | null;
  enabled: boolean;
  note: string | null;
  createdAt: string;
}

// Effects live in the daily-brief catalog; this page only manages assignments
// (previously done with raw SQL over SSH). One active egg per user — enabling
// an egg switches off the user's other rows server-side.
const EGG_KEYS = Object.keys(EGG_CATALOG);

const AdminEasterEggsPage: React.FC = () => {
  const { adminUsers, fetchAdminUsers } = useAdminStore(useShallow((state) => ({
    adminUsers: state.adminUsers,
    fetchAdminUsers: state.fetchAdminUsers,
  })));
  const locale = useLocaleStore((state) => state.locale);

  const [targets, setTargets] = useState<EasterEggTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [newUserId, setNewUserId] = useState('');
  const [newEggKey, setNewEggKey] = useState(EGG_KEYS[0] ?? '');
  const [newNote, setNewNote] = useState('');
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState('');

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
    fetchAdminUsers();
  }, [loadTargets, fetchAdminUsers]);

  const pagination = useTablePagination(targets, 'easter-eggs');

  const sortedUsers = useMemo(
    () => [...adminUsers].sort((left, right) => (left.email ?? '').localeCompare(right.email ?? '')),
    [adminUsers],
  );

  const handleAssign = async () => {
    if (!newUserId || !newEggKey) {
      setSaveError(t`Pick a user and an egg.`);
      return;
    }
    setSaveSubmitting(true);
    setSaveError('');
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.EASTER_EGGS_SAVE,
      userId: newUserId,
      eggKey: newEggKey,
      enabled: true,
      ...(newNote.trim() ? { note: newNote.trim() } : {}),
    });
    setSaveSubmitting(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setNewUserId('');
    setNewNote('');
    await loadTargets();
  };

  const saveTarget = async (target: EasterEggTarget, changes: { eggKey?: string; enabled?: boolean }) => {
    setRowActionId(target.id);
    setRowActionError('');
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.EASTER_EGGS_SAVE,
      id: target.id,
      userId: target.userId,
      eggKey: changes.eggKey ?? target.eggKey,
      enabled: changes.enabled ?? target.enabled,
      ...(target.note ? { note: target.note } : {}),
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

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-3">
        <div className="text-sm font-semibold">{t`Assign an easter egg`}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{t`User`}</Label>
            <Select value={newUserId} onValueChange={setNewUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t`Select user`} />
              </SelectTrigger>
              <SelectContent>
                {sortedUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.email ?? shortId(user.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t`Egg`}</Label>
            <Select value={newEggKey} onValueChange={setNewEggKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EGG_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>{key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t`Note`}</Label>
            <Input
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              placeholder={t`Optional`}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={handleAssign} disabled={saveSubmitting} className="w-full sm:w-auto">
              {t`Assign`}
            </Button>
          </div>
        </div>
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
                  <TableHead>{t`User`}</TableHead>
                  <TableHead>{t`Egg`}</TableHead>
                  <TableHead>{t`Note`}</TableHead>
                  <TableHead>{t`Created`}</TableHead>
                  <TableHead>{t`Active`}</TableHead>
                  <TableHead className="text-right">{t`Actions`}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      {t`No easter eggs assigned.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagination.pageRows.map((target) => (
                    <TableRow key={target.id}>
                      <TableCell className="font-medium">
                        <div className="max-w-[220px] truncate">
                          {target.userDisplayName ?? target.userEmail ?? shortId(target.userId)}
                        </div>
                        {target.userEmail && target.userDisplayName && (
                          <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {target.userEmail}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Select
                          value={target.eggKey}
                          onValueChange={(key) => void handleChangeKey(target, key)}
                          disabled={rowActionId === target.id}
                        >
                          <SelectTrigger className="h-8 w-[150px]" aria-label={t`Change easter egg`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EGG_KEYS.map((key) => (
                              <SelectItem key={key} value={key}>{key}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {target.note ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">{formatDateCompact(target.createdAt, locale)}</TableCell>
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
                  ))
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
