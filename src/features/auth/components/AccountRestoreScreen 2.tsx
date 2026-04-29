import React, { useMemo, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { useAuthStore } from '@/features/auth/store/authStore';
import { DataExportButton } from './DataExportButton';

export const AccountRestoreScreen: React.FC = () => {
  const cancelAccountDeletion = useAuthStore((state) => state.cancelAccountDeletion);
  const signOut = useAuthStore((state) => state.signOut);
  const purgeAfter = useAuthStore((state) => state.profilePurgeAfter);
  const profileDisplayName = useAuthStore((state) => state.profileDisplayName);
  const user = useAuthStore((state) => state.user);

  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purgeLabel = useMemo(() => {
    if (!purgeAfter) return null;
    try {
      const distance = formatDistanceToNow(parseISO(purgeAfter), { addSuffix: true });
      return distance;
    } catch (_err) {
      return purgeAfter;
    }
  }, [purgeAfter]);

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    const result = await cancelAccountDeletion();
    setRestoring(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // Full reload so all the normal ACTIVE UI re-renders from fresh data.
    if (typeof window !== 'undefined') {
      window.location.assign('/app');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t`Your account is scheduled for deletion`}</h1>
          <p className="text-sm text-muted-foreground">
            {t`Signed in as ${profileDisplayName ?? user?.email ?? ''}`}
          </p>
          {purgeLabel && (
            <p className="text-sm">
              {t`It will be permanently purged ${purgeLabel}.`}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            onClick={handleRestore}
            disabled={restoring}
            className="w-full"
          >
            {restoring ? t`Restoring…` : t`Restore my account`}
          </Button>
          <DataExportButton />
          <Button
            type="button"
            variant="ghost"
            onClick={() => signOut()}
            className="w-full"
          >
            {t`Sign out`}
          </Button>
        </div>

        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
};
