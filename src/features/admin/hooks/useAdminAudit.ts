import { useCallback, useEffect, useState } from 'react';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import type { AdminAuditRecord } from '@/features/admin/lib/auditText';

type AuditPage = { entries: AdminAuditRecord[]; hasMore: boolean };

/** Admin → Activity log: the newest entries, and older ones on request. */
export const useAdminAudit = () => {
  const [entries, setEntries] = useState<AdminAuditRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    const result = await invokeAdminFunction<AuditPage>({
      action: ADMIN_ACTIONS.AUDIT_LIST,
      ...(before ? { before } : {}),
    });
    setLoading(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    setEntries((current) => (before ? [...current, ...result.data.entries] : result.data.entries));
    setHasMore(Boolean(result.data.hasMore));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOlder = useCallback(() => {
    const last = entries[entries.length - 1];
    if (last) void load(last.id);
  }, [entries, load]);

  return { entries, hasMore, loading, error, refresh: () => load(), loadOlder };
};
