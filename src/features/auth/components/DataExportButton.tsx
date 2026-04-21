import React, { useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@/shared/ui/sonner';
import { Button } from '@/shared/ui/button';
import { useAuthStore, type DataExportStatusRow } from '@/features/auth/store/authStore';

interface Props {
  className?: string;
}

const POLL_INTERVAL_MS = 5000;

const formatRetryAfter = (seconds: number): string => {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? t`under a minute` : t`${minutes} minutes`;
};

export const DataExportButton: React.FC<Props> = ({ className }) => {
  const requestDataExport = useAuthStore((state) => state.requestDataExport);
  const getDataExportStatus = useAuthStore((state) => state.getDataExportStatus);

  const [status, setStatus] = useState<DataExportStatusRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  // Предыдущий статус нужен, чтобы тост сработал ровно один раз при переходе
  // pending|processing → ready|failed (без этого повторные polls триггерили бы дубликаты).
  const previousStatusRef = useRef<string | null>(null);

  const pollStatus = React.useCallback(async () => {
    const result = await getDataExportStatus();
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setStatus(result.data);
    }
  }, [getDataExportStatus]);

  useEffect(() => {
    pollStatus();
  }, [pollStatus]);

  useEffect(() => {
    if (!status || (status.status !== 'pending' && status.status !== 'processing')) {
      return;
    }
    const id = window.setInterval(pollStatus, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [status, pollStatus]);

  // Toast при смене статуса pending|processing → ready|failed.
  useEffect(() => {
    const current = status?.status ?? null;
    const previous = previousStatusRef.current;
    previousStatusRef.current = current;
    if (!current || current === previous) return;
    const wasInFlight = previous === 'pending' || previous === 'processing';
    if (current === 'ready' && wasInFlight) {
      toast.success(t`Your data export is ready to download.`);
    } else if (current === 'failed' && wasInFlight) {
      toast.error(t`Data export failed: ${status?.errorMessage ?? t`unknown error`}`);
    }
  }, [status]);

  const handleRequest = async () => {
    setLoading(true);
    setError(null);
    setRetryAfter(null);
    const result = await requestDataExport();
    setLoading(false);
    if (result.error) {
      setRetryAfter(result.retryAfter ?? null);
      setError(result.error);
      return;
    }
    await pollStatus();
  };

  const isInFlight = status?.status === 'pending' || status?.status === 'processing';
  const isReady = status?.status === 'ready' && status.downloadUrl;
  const isExpired = status?.status === 'expired'
    || (status?.status === 'ready' && status.expiresAt && new Date(status.expiresAt) < new Date());

  return (
    <div className={className}>
      {isReady ? (
        <Button asChild variant="outline" className="w-full">
          <a href={status.downloadUrl ?? '#'} target="_blank" rel="noreferrer">
            <Download className="mr-2 h-4 w-4" />
            {t`Download export`}
          </a>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={handleRequest}
          disabled={loading || isInFlight}
          className="w-full"
        >
          {isInFlight ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t`Preparing your data…`}
            </>
          ) : (
            t`Export my data`
          )}
        </Button>
      )}

      {isExpired && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t`The previous export file has expired. Request it again.`}
        </p>
      )}

      {status?.status === 'failed' && (
        <p className="mt-1 text-xs text-destructive">
          {t`Last export failed: ${status.errorMessage ?? t`unknown error`}`}
        </p>
      )}

      {error && !retryAfter && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
      {retryAfter !== null && retryAfter > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t`You can request a new export in ${formatRetryAfter(retryAfter)}.`}
        </p>
      )}
    </div>
  );
};
