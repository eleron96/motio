import { createElement } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@lingui/macro';

// Both toasts share one id, so "restored" replaces "no connection" in place.
const SYNC_STATUS_TOAST_ID = 'sync-status';

export const showConnectionRestoredToast = () => {
  toast.success(t`Connection restored`, {
    id: SYNC_STATUS_TOAST_ID,
    position: 'bottom-right',
    duration: 3000,
  });
};

export const showConnectionLostToast = () => {
  const compact = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 767px)').matches;
  if (compact) {
    // Mobile: a compact icon-only badge on the right, instead of a
    // full-width text toast that would crowd the narrow screen.
    toast.custom(
      () => createElement(
        'div',
        {
          className: 'flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg',
          role: 'status',
          'aria-label': t`No connection`,
        },
        createElement(WifiOff, { className: 'h-5 w-5' }),
      ),
      { id: SYNC_STATUS_TOAST_ID, position: 'top-right', duration: Infinity },
    );
    return;
  }
  toast.error(t`No connection`, {
    id: SYNC_STATUS_TOAST_ID,
    position: 'bottom-right',
    duration: Infinity,
  });
};
