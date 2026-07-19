import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { formatDate } from '@/features/admin/lib/format';

interface BroadcastRow {
  id: string;
  subject: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  finishedAt: string | null;
}

// Announcement email to every opted-in user. Send snapshots the audience
// into a queue; the page then drives processing in batches until the queue
// is dry, showing live progress.
const AdminBroadcastPage: React.FC = () => {
  const locale = useLocaleStore((state) => state.locale);

  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [sendError, setSendError] = useState('');

  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  const loadAudience = useCallback(async () => {
    const { data } = await invokeAdminFunction<{ count?: number }>({
      action: ADMIN_ACTIONS.BROADCASTS_AUDIENCE,
    });
    setAudienceCount(data?.count ?? 0);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    const { data, error } = await invokeAdminFunction<{ broadcasts?: BroadcastRow[] }>({
      action: ADMIN_ACTIONS.BROADCASTS_LIST,
    });
    setHistoryLoading(false);
    if (error) {
      setHistoryError(error);
      return;
    }
    setHistory(data?.broadcasts ?? []);
  }, []);

  useEffect(() => {
    loadAudience();
    loadHistory();
  }, [loadAudience, loadHistory]);

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setSendError('');
    setProgress(null);

    const { data: created, error: createError } = await invokeAdminFunction<{ broadcastId?: string; total?: number }>({
      action: ADMIN_ACTIONS.BROADCASTS_SEND,
      subject: subject.trim(),
      body: body.trim(),
    });

    if (createError || !created?.broadcastId) {
      setSendError(createError ?? t`Failed to start the broadcast.`);
      setSending(false);
      return;
    }

    const total = created.total ?? 0;
    setProgress({ sent: 0, failed: 0, total });

    // Drive the queue until dry. Each call sends one batch server-side.
    let done = total === 0;
    while (!done) {
      const { data: step, error: stepError } = await invokeAdminFunction<{
        remaining?: number; sentCount?: number; failedCount?: number; done?: boolean;
      }>({
        action: ADMIN_ACTIONS.BROADCASTS_PROCESS,
        broadcastId: created.broadcastId,
      });
      if (stepError) {
        setSendError(stepError);
        break;
      }
      setProgress({
        sent: step?.sentCount ?? 0,
        failed: step?.failedCount ?? 0,
        total,
      });
      done = Boolean(step?.done);
    }

    setSending(false);
    if (done) {
      setSubject('');
      setBody('');
    }
    await loadHistory();
  };

  const statusLabel = (status: string) => {
    if (status === 'sent') return t`Sent`;
    if (status === 'sending') return t`Sending`;
    return t`Failed`;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">{t`New announcement`}</div>
          <div className="text-xs text-muted-foreground">
            {audienceCount === null ? '…' : t`Subscribers: ${audienceCount}`}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="broadcast-subject">{t`Subject`}</Label>
          <Input
            id="broadcast-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
            disabled={sending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="broadcast-body">{t`Message`}</Label>
          <Textarea
            id="broadcast-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            maxLength={10000}
            disabled={sending}
            placeholder={t`Plain text. Blank line starts a new paragraph.`}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSend || audienceCount === 0}
          >
            {t`Send`}
          </Button>
          {audienceCount === 0 && (
            <span className="text-xs text-muted-foreground">{t`Nobody has opted in yet.`}</span>
          )}
          {progress && (
            <span className="text-xs text-muted-foreground">
              {t`Progress: ${progress.sent + progress.failed} / ${progress.total}`}
              {progress.failed > 0 ? ` (${t`failed`}: ${progress.failed})` : ''}
            </span>
          )}
        </div>
        {sendError && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{sendError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">{t`History`}</div>
        {historyError && (
          <Alert variant="destructive">
            <AlertTitle>{t`Error`}</AlertTitle>
            <AlertDescription>{historyError}</AlertDescription>
          </Alert>
        )}
        {historyLoading ? (
          <div className="py-4 text-sm text-muted-foreground">{t`Loading history...`}</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t`Subject`}</TableHead>
                  <TableHead>{t`Status`}</TableHead>
                  <TableHead>{t`Delivered`}</TableHead>
                  <TableHead>{t`Date`}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      {t`No broadcasts yet.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[280px] truncate font-medium">{row.subject}</TableCell>
                      <TableCell className="text-sm">{statusLabel(row.status)}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {row.sentCount}/{row.totalRecipients}
                        {row.failedCount > 0 ? ` (${t`failed`}: ${row.failedCount})` : ''}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(row.createdAt, locale)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Send this announcement?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`The email will go to ${audienceCount ?? 0} subscribed users. This cannot be recalled.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              {t`Send`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBroadcastPage;
