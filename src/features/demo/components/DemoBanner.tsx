import { useState } from 'react';
import { Trans, t } from '@lingui/macro';
import { RotateCcw } from 'lucide-react';
import { toast } from '@/shared/ui/sonner';
import { Button } from '@/shared/ui/button';
import { supabase } from '@/shared/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useDemoConversion } from '../providers/DemoConversionProvider';

export const DemoBanner = () => {
  const { open } = useDemoConversion();
  const fetchWorkspaces = useAuthStore((state) => state.fetchWorkspaces);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const { error } = await supabase.rpc('reset_demo_workspace');
      if (error) {
        toast.error(t`Reset failed. Try again in a moment.`);
        return;
      }
      await fetchWorkspaces();
      // Hard reload the route so every store rehydrates against the new
      // workspace_id without us needing to surgically reset every slice.
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (_error) {
      toast.error(t`Reset failed. Try again in a moment.`);
    } finally {
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
        <Trans>Changes won't be saved. The sandbox resets after 10 minutes of inactivity.</Trans>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={resetting}
          className="h-7 gap-1.5 px-2 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-100 dark:hover:bg-amber-900/40 dark:hover:text-amber-100"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {resetting ? <Trans>Resetting…</Trans> : <Trans>Reset demo</Trans>}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => open('banner')}
          className="h-7 px-3 text-xs"
        >
          <Trans>Save your work</Trans>
        </Button>
      </div>
    </div>
  );
};
