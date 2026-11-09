import React from 'react';
import { t } from '@lingui/macro';
import { RefreshCw } from 'lucide-react';
import { useAdminAudit } from '@/features/admin/hooks/useAdminAudit';
import { auditActor, auditText } from '@/features/admin/lib/auditText';
import { formatDate } from '@/features/admin/lib/format';
import { useLocaleStore } from '@/shared/store/localeStore';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

/**
 * Admin console → Activity log: what super admins changed here (settings,
 * members, workspaces, mappings, broadcasts…) and what the Keycloak group sync
 * did on its own. Newest first.
 */
const AdminAuditPage: React.FC = () => {
  const { entries, hasMore, loading, error, refresh, loadOlder } = useAdminAudit();
  const locale = useLocaleStore((state) => state.locale);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t`What super admins changed in this console and what the Keycloak group sync did on its own. Command-line changes of settings are here too. Backups and Keycloak's own console keep their own logs.`}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t`Refresh`}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t`Could not load the log`}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && entries.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">{t`Nothing recorded yet.`}</p>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">{t`When`}</TableHead>
                <TableHead className="w-[180px]">{t`Who`}</TableHead>
                <TableHead>{t`What`}</TableHead>
                <TableHead className="w-[200px]">{t`Workspace`}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(entry.createdAt, locale)}</TableCell>
                  <TableCell className="text-sm">{auditActor(entry)}</TableCell>
                  <TableCell className="text-sm">{auditText(entry)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{entry.workspaceName ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && (
        <Button type="button" variant="outline" onClick={loadOlder} disabled={loading}>
          {t`Show older`}
        </Button>
      )}
    </div>
  );
};

export default AdminAuditPage;
