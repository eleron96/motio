import React, { useEffect, useMemo } from 'react';
import { useAdminStore } from '@/features/admin/store/adminStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useShallow } from 'zustand/react/shallow';
import { APP_VERSION } from '@/shared/lib/appVersion';
import { formatDate, formatStorageMain } from '@/features/admin/lib/format';
import { AdminMessagingSummary } from '@/features/admin/components/AdminMessagingSummary';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, hint }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </CardContent>
  </Card>
);

// System-at-a-glance built entirely from the data the other sections already
// fetch — no dedicated overview API.
const AdminOverviewPage: React.FC = () => {
  const {
    adminUsers,
    adminUsersLoading,
    fetchAdminUsers,
    adminWorkspaces,
    adminWorkspacesLoading,
    fetchAdminWorkspaces,
    backups,
    backupsLoading,
    fetchBackups,
  } = useAdminStore(useShallow((state) => ({
    adminUsers: state.adminUsers,
    adminUsersLoading: state.adminUsersLoading,
    fetchAdminUsers: state.fetchAdminUsers,
    adminWorkspaces: state.adminWorkspaces,
    adminWorkspacesLoading: state.adminWorkspacesLoading,
    fetchAdminWorkspaces: state.fetchAdminWorkspaces,
    backups: state.backups,
    backupsLoading: state.backupsLoading,
    fetchBackups: state.fetchBackups,
  })));
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    fetchAdminUsers();
    fetchAdminWorkspaces();
    fetchBackups();
  }, [fetchAdminUsers, fetchAdminWorkspaces, fetchBackups]);

  const totalStorageBytes = useMemo(
    () => adminUsers.reduce((sum, user) => sum + (user.storageUsedBytes ?? 0), 0),
    [adminUsers],
  );

  const latestBackup = useMemo(() => {
    if (backups.length === 0) return null;
    return backups.reduce((latest, item) => (
      new Date(item.createdAt).getTime() > new Date(latest.createdAt).getTime() ? item : latest
    ));
  }, [backups]);

  const loadingPlaceholder = '…';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label={t`Users`}
          value={adminUsersLoading ? loadingPlaceholder : adminUsers.length}
        />
        <MetricCard
          label={t`Workspaces`}
          value={adminWorkspacesLoading ? loadingPlaceholder : adminWorkspaces.length}
        />
        <MetricCard
          label={t`Storage used`}
          value={adminUsersLoading ? loadingPlaceholder : formatStorageMain(totalStorageBytes)}
          hint={t`Task media across all users`}
        />
        <MetricCard
          label={t`Latest backup`}
          value={backupsLoading
            ? loadingPlaceholder
            : (latestBackup ? formatDate(latestBackup.createdAt, locale) : t`No backups`)}
          hint={latestBackup?.name}
        />
        <MetricCard
          label={t`Backups stored`}
          value={backupsLoading ? loadingPlaceholder : backups.length}
        />
        <MetricCard
          label={t`App version`}
          value={APP_VERSION}
        />
      </div>

      <AdminMessagingSummary />
    </div>
  );
};

export default AdminOverviewPage;
