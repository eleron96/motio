import React from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store/authStore';

export const PendingDeletionBanner: React.FC = () => {
  const status = useAuthStore((state) => state.profileStatus);
  const purgeAfter = useAuthStore((state) => state.profilePurgeAfter);
  const cancelAccountDeletion = useAuthStore((state) => state.cancelAccountDeletion);

  if (status !== 'PENDING_DELETION') return null;

  const purgeLabel = purgeAfter ? (() => {
    try {
      return formatDistanceToNow(parseISO(purgeAfter), { addSuffix: true });
    } catch (_err) {
      return null;
    }
  })() : null;

  const handleRestore = async () => {
    const result = await cancelAccountDeletion();
    if (!result.error && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-amber-400 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>
          {purgeLabel
            ? t`Account deletion scheduled — purge ${purgeLabel}.`
            : t`Account deletion scheduled.`}
        </span>
      </div>
      <button
        type="button"
        onClick={handleRestore}
        className="font-medium underline underline-offset-2 hover:opacity-80"
      >
        {t`Restore account`}
      </button>
    </div>
  );
};
