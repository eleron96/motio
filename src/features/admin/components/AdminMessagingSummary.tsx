import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@lingui/macro';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { formatDate } from '@/features/admin/lib/format';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useAnnouncementHistory } from '@/features/admin/hooks/useAnnouncementHistory';
import { summarizeAnnouncements, type AnnouncementRow } from '@/features/admin/lib/announcements';
import { summarizeBroadcasts, type BroadcastRow } from '@/features/admin/lib/broadcasts';

const broadcastStatusLabel = (status: string): string => {
  if (status === 'sent') return t`Sent`;
  if (status === 'sending') return t`Sending`;
  if (status === 'scheduled') return t`Scheduled`;
  if (status === 'canceled') return t`Canceled`;
  return t`Failed`;
};

/**
 * What is currently reaching people, on the page the console opens on: which
 * announcement is up right now, what is queued behind it, and where the last
 * email broadcast got to. Everything else about messaging lives one click away
 * on the broadcast page.
 */
export const AdminMessagingSummary: React.FC = () => {
  const locale = useLocaleStore((state) => state.locale);
  const { rows: announcements, loading: announcementsLoading } = useAnnouncementHistory();

  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void invokeAdminFunction<{ broadcasts?: BroadcastRow[] }>({ action: ADMIN_ACTIONS.BROADCASTS_LIST })
      .then(({ data }) => {
        if (!active) return;
        setBroadcasts(data?.broadcasts ?? []);
        setBroadcastsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const announcementSummary = summarizeAnnouncements(announcements);
  const broadcastSummary = summarizeBroadcasts(broadcasts);
  const [liveNow, ...alsoLive] = announcementSummary.live;

  const queued = [
    announcementSummary.scheduled > 0 ? t`scheduled: ${announcementSummary.scheduled}` : null,
    announcementSummary.drafts > 0 ? t`drafts: ${announcementSummary.drafts}` : null,
  ].filter(Boolean).join(' · ');

  const renderLive = (row: AnnouncementRow) => (
    <div key={row.id} className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.title}</span>
        <Badge variant={row.level === 'critical' ? 'destructive' : 'secondary'}>
          {row.level === 'critical' ? t`Important` : t`Banner`}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {row.endsAt ? t`Until ${formatDate(row.endsAt, locale)}` : t`No end date`}
        {' · '}
        {t`closed by ${row.dismissedCount}`}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">{t`Messaging`}</CardTitle>
        <Link to="/app/admin/broadcast" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          {t`Broadcast`}
        </Link>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t`In the app`}
          </div>
          {announcementsLoading ? (
            <div className="text-muted-foreground">…</div>
          ) : liveNow ? (
            <div className="space-y-2">
              {renderLive(liveNow)}
              {alsoLive.map(renderLive)}
            </div>
          ) : (
            <div className="text-muted-foreground">{t`Nothing is showing right now.`}</div>
          )}
          {!announcementsLoading && queued && (
            <div className="text-xs text-muted-foreground">{queued}</div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t`Email`}
          </div>
          {broadcastsLoading ? (
            <div className="text-muted-foreground">…</div>
          ) : broadcastSummary.latest ? (
            <div className="space-y-1">
              <div className="font-medium">{broadcastSummary.latest.subject}</div>
              <div className="text-xs text-muted-foreground">
                {broadcastStatusLabel(broadcastSummary.latest.status)}
                {' · '}
                {t`delivered ${broadcastSummary.latest.sentCount} of ${broadcastSummary.latest.totalRecipients}`}
                {' · '}
                {formatDate(broadcastSummary.latest.createdAt, locale)}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">{t`Nothing has been sent yet.`}</div>
          )}
          {!broadcastsLoading && (broadcastSummary.scheduled > 0 || broadcastSummary.sending > 0) && (
            <div className="text-xs text-muted-foreground">
              {broadcastSummary.sending > 0 ? t`sending now: ${broadcastSummary.sending}` : ''}
              {broadcastSummary.sending > 0 && broadcastSummary.scheduled > 0 ? ' · ' : ''}
              {broadcastSummary.scheduled > 0 ? t`scheduled: ${broadcastSummary.scheduled}` : ''}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
