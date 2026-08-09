import { useCallback, useEffect, useState } from 'react';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import type { AnnouncementRow } from '@/features/admin/lib/announcements';

interface AnnouncementHistory {
  rows: AnnouncementRow[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  setError: (message: string) => void;
}

/**
 * The announcement history, shared by the broadcast page (which manages it) and
 * the overview (which only summarises it).
 */
export const useAnnouncementHistory = (): AnnouncementHistory => {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const { data, error: listError } = await invokeAdminFunction<{ announcements?: AnnouncementRow[] }>({
      action: ADMIN_ACTIONS.ANNOUNCEMENTS_LIST,
    });
    setLoading(false);
    if (listError) {
      setError(listError);
      return;
    }
    setError('');
    setRows(data?.announcements ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload, setError };
};
