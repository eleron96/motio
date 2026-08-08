import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminStore } from '@/features/admin/store/adminStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
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
import { AdminAnnouncementForm } from '@/features/admin/components/AdminAnnouncementForm';
import type {
  BroadcastAudienceKind,
  BroadcastMessageType,
  BroadcastRow,
} from '@/features/admin/lib/broadcasts';

// Two ways to reach people: mail they keep, or a banner where they already
// are. Chosen per message — nothing is sent to both automatically.
type Channel = 'email' | 'banner';
type MessageType = BroadcastMessageType;
type AudienceKind = BroadcastAudienceKind;

// The audience-kind options depend on message type: announcements target
// subscribers (opt-in respected); a service notice can address all active users
// (transactional, opt-in bypassed). Domain/workspace narrowing works for both.
const kindsForType = (type: MessageType): AudienceKind[] =>
  type === 'announcement'
    ? ['subscribers', 'domain', 'workspace']
    : ['all_active', 'domain', 'workspace'];

const AdminBroadcastPage: React.FC = () => {
  const { adminWorkspaces, fetchAdminWorkspaces } = useAdminStore(useShallow((state) => ({
    adminWorkspaces: state.adminWorkspaces,
    fetchAdminWorkspaces: state.fetchAdminWorkspaces,
  })));
  const locale = useLocaleStore((state) => state.locale);

  const [messageType, setMessageType] = useState<MessageType>('announcement');
  const [channel, setChannel] = useState<Channel>('email');
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('subscribers');
  const [domainValue, setDomainValue] = useState('');
  const [workspaceValue, setWorkspaceValue] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduleLater, setScheduleLater] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceCounting, setAudienceCounting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [sendError, setSendError] = useState('');

  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const audienceValue = audienceKind === 'domain'
    ? domainValue.trim()
    : audienceKind === 'workspace'
      ? workspaceValue
      : undefined;

  // Value is only "ready" once a domain/workspace is actually chosen.
  const audienceReady = audienceKind === 'domain'
    ? domainValue.trim().length > 0
    : audienceKind === 'workspace'
      ? workspaceValue.length > 0
      : true;

  const loadAudience = useCallback(async () => {
    if (!audienceReady) {
      setAudienceCount(null);
      return;
    }
    setAudienceCounting(true);
    const { data } = await invokeAdminFunction<{ count?: number }>({
      action: ADMIN_ACTIONS.BROADCASTS_AUDIENCE,
      messageType,
      audienceKind,
      ...(audienceValue ? { audienceValue } : {}),
    });
    setAudienceCounting(false);
    setAudienceCount(data?.count ?? 0);
  }, [audienceReady, messageType, audienceKind, audienceValue]);

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
    fetchAdminWorkspaces();
    loadHistory();
  }, [fetchAdminWorkspaces, loadHistory]);

  // Recompute the recipient count whenever the segment changes.
  useEffect(() => {
    void loadAudience();
  }, [loadAudience]);

  const handleTypeChange = (next: MessageType) => {
    setMessageType(next);
    // Keep the audience kind valid for the new type.
    const allowed = kindsForType(next);
    if (!allowed.includes(audienceKind)) {
      setAudienceKind(allowed[0]!);
    }
  };

  const kindLabel = (kind: AudienceKind) => {
    if (kind === 'subscribers') return t`All subscribers`;
    if (kind === 'all_active') return t`All active users`;
    if (kind === 'domain') return t`By email domain`;
    return t`By workspace`;
  };

  const canSend = subject.trim().length > 0
    && body.trim().length > 0
    && audienceReady
    && !sending
    && (!scheduleLater || scheduledAt.length > 0);

  const scheduledIso = useMemo(() => {
    if (!scheduleLater || !scheduledAt) return undefined;
    const ms = Date.parse(scheduledAt);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }, [scheduleLater, scheduledAt]);

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);
    setSendError('');
    setProgress(null);

    const { data: created, error: createError } = await invokeAdminFunction<{
      broadcastId?: string; total?: number; scheduled?: boolean;
    }>({
      action: ADMIN_ACTIONS.BROADCASTS_SEND,
      subject: subject.trim(),
      body: body.trim(),
      messageType,
      audienceKind,
      ...(audienceValue ? { audienceValue } : {}),
      ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
    });

    if (createError || !created?.broadcastId) {
      setSendError(createError ?? t`Failed to start the broadcast.`);
      setSending(false);
      return;
    }

    // Scheduled sends are delivered by the server ticker; nothing to drive here.
    if (created.scheduled) {
      setSending(false);
      setSubject('');
      setBody('');
      setScheduleLater(false);
      setScheduledAt('');
      await loadHistory();
      return;
    }

    const total = created.total ?? 0;
    setProgress({ sent: 0, failed: 0, total });

    let done = total === 0;
    while (!done) {
      const { data: step, error: stepError } = await invokeAdminFunction<{
        remaining?: number; processed?: number; sentCount?: number; failedCount?: number; done?: boolean;
      }>({
        action: ADMIN_ACTIONS.BROADCASTS_PROCESS,
        broadcastId: created.broadcastId,
      });
      if (stepError) {
        setSendError(stepError);
        break;
      }
      setProgress({ sent: step?.sentCount ?? 0, failed: step?.failedCount ?? 0, total });
      done = Boolean(step?.done);
      // Nothing left for this driver to claim (the background ticker holds the
      // rest) — stop looping; it finishes server-side.
      if (!done && (step?.processed ?? 0) === 0) break;
    }

    setSending(false);
    if (done) {
      setSubject('');
      setBody('');
    }
    await loadHistory();
  };

  const handleCancel = async (id: string) => {
    setCancelingId(id);
    await invokeAdminFunction({ action: ADMIN_ACTIONS.BROADCASTS_CANCEL, broadcastId: id });
    setCancelingId(null);
    await loadHistory();
  };

  const statusLabel = (status: string) => {
    if (status === 'sent') return t`Sent`;
    if (status === 'sending') return t`Sending`;
    if (status === 'scheduled') return t`Scheduled`;
    if (status === 'canceled') return t`Canceled`;
    return t`Failed`;
  };

  const availableKinds = kindsForType(messageType);

  const channelSwitch = (
    <div className="space-y-1.5">
      <Label>{t`Channel`}</Label>
      <SegmentedControl>
        <SegmentedControlItem active={channel === 'email'} onClick={() => setChannel('email')}>
          {t`Email`}
        </SegmentedControlItem>
        <SegmentedControlItem active={channel === 'banner'} onClick={() => setChannel('banner')}>
          {t`In the app`}
        </SegmentedControlItem>
      </SegmentedControl>
    </div>
  );

  if (channel === 'banner') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border p-4">{channelSwitch}</div>
        <AdminAnnouncementForm workspaces={adminWorkspaces} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-4">
        {channelSwitch}
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">{t`New broadcast`}</div>
          <div className="text-xs text-muted-foreground">
            {!audienceReady
              ? t`Choose an audience`
              : audienceCounting
                ? '…'
                : t`Recipients: ${audienceCount ?? 0}`}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t`Type`}</Label>
            <SegmentedControl>
              <SegmentedControlItem active={messageType === 'announcement'} onClick={() => handleTypeChange('announcement')}>
                {t`Announcement`}
              </SegmentedControlItem>
              <SegmentedControlItem active={messageType === 'service'} onClick={() => handleTypeChange('service')}>
                {t`Service notice`}
              </SegmentedControlItem>
            </SegmentedControl>
            <p className="text-xs text-muted-foreground">
              {messageType === 'announcement'
                ? t`Marketing news — only to opted-in users, with an unsubscribe link.`
                : t`Transactional — to all active users, no opt-out. Use only for account, maintenance or legal notices.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t`Audience`}</Label>
            <Select value={audienceKind} onValueChange={(value) => setAudienceKind(value as AudienceKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableKinds.map((kind) => (
                  <SelectItem key={kind} value={kind}>{kindLabel(kind)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {audienceKind === 'domain' && (
              <Input
                value={domainValue}
                onChange={(event) => setDomainValue(event.target.value)}
                placeholder="example.com"
                disabled={sending}
              />
            )}
            {audienceKind === 'workspace' && (
              <Select value={workspaceValue} onValueChange={setWorkspaceValue}>
                <SelectTrigger>
                  <SelectValue placeholder={t`Select workspace`} />
                </SelectTrigger>
                <SelectContent>
                  {adminWorkspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl surface="compact">
            <SegmentedControlItem active={!scheduleLater} onClick={() => setScheduleLater(false)}>
              {t`Send now`}
            </SegmentedControlItem>
            <SegmentedControlItem active={scheduleLater} onClick={() => setScheduleLater(true)}>
              {t`Schedule`}
            </SegmentedControlItem>
          </SegmentedControl>
          {scheduleLater && (
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="sm:w-auto"
              disabled={sending}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!canSend || audienceCount === 0}>
            {scheduleLater ? t`Schedule` : t`Send`}
          </Button>
          {audienceReady && audienceCount === 0 && (
            <span className="text-xs text-muted-foreground">{t`No recipients match this audience.`}</span>
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
                  <TableHead>{t`Type`}</TableHead>
                  <TableHead>{t`Status`}</TableHead>
                  <TableHead>{t`Delivered`}</TableHead>
                  <TableHead>{t`Date`}</TableHead>
                  <TableHead className="text-right">{t`Actions`}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      {t`No broadcasts yet.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[240px] truncate font-medium">{row.subject}</TableCell>
                      <TableCell className="text-sm">
                        {row.messageType === 'service' ? t`Service notice` : t`Announcement`}
                      </TableCell>
                      <TableCell className="text-sm">
                        {statusLabel(row.status)}
                        {row.status === 'scheduled' && row.scheduledAt
                          ? ` · ${formatDate(row.scheduledAt, locale)}`
                          : ''}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {row.sentCount}/{row.totalRecipients}
                        {row.failedCount > 0 ? ` (${t`failed`}: ${row.failedCount})` : ''}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(row.createdAt, locale)}</TableCell>
                      <TableCell className="text-right">
                        {row.status === 'scheduled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleCancel(row.id)}
                            disabled={cancelingId === row.id}
                          >
                            {t`Cancel`}
                          </Button>
                        )}
                      </TableCell>
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
            <AlertDialogTitle>
              {scheduleLater ? t`Schedule this broadcast?` : t`Send this broadcast?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {messageType === 'service'
                ? t`This SERVICE notice will go to ${audienceCount ?? 0} active users, ignoring their marketing opt-in. Use only for genuinely essential messages.`
                : t`This announcement will go to ${audienceCount ?? 0} opted-in users.`}
              {scheduleLater && scheduledAt ? ` ${t`Scheduled for`} ${formatDate(scheduledIso ?? scheduledAt, locale)}.` : ''}
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
              {scheduleLater ? t`Schedule` : t`Send`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBroadcastPage;
