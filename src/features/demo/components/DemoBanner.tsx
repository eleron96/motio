import { useState } from 'react';
import { Trans, t } from '@lingui/macro';
import { RotateCcw } from 'lucide-react';
import { toast } from '@/shared/ui/sonner';
import { Button } from '@/shared/ui/button';
import { demoStore } from '../lib/demoDataStore';

export const DemoBanner = () => {
  const [resetting, setResetting] = useState(false);

  const handleReset = () => {
    if (resetting) return;
    setResetting(true);
    try {
      demoStore.reset();
      // Hard reload the route so every store rehydrates against the
      // fresh seed without us needing to surgically reset every slice.
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (_error) {
      toast.error(t`Reset failed. Try again in a moment.`);
      setResetting(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="min-w-0 truncate">
        <span className="font-semibold">
          <Trans>Demo sandbox</Trans>
        </span>
        <span className="mx-2 opacity-60">·</span>
        <Trans>Changes won't be saved. The sandbox resets after 24 hours of inactivity.</Trans>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleReset}
        disabled={resetting}
        className="h-7 shrink-0 gap-1.5 px-2 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-100 dark:hover:bg-amber-900/40 dark:hover:text-amber-100"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {resetting ? <Trans>Resetting…</Trans> : <Trans>Reset demo</Trans>}
      </Button>
    </div>
  );
};
