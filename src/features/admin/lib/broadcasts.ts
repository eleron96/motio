export type BroadcastMessageType = 'announcement' | 'service';
export type BroadcastAudienceKind = 'subscribers' | 'domain' | 'workspace' | 'all_active';
export type BroadcastStatus = 'scheduled' | 'sending' | 'sent' | 'canceled' | 'failed';

/** One row of the email broadcast history, as the admin function returns it. */
export interface BroadcastRow {
  id: string;
  subject: string;
  status: string;
  messageType: BroadcastMessageType;
  audienceKind: BroadcastAudienceKind;
  audienceValue: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** Still going: either queued for later or mid-flight right now. */
export const isBroadcastInFlight = (row: BroadcastRow): boolean =>
  row.status === 'scheduled' || row.status === 'sending';

export interface BroadcastSummary {
  /** The most recent broadcast overall, whatever its state. */
  latest: BroadcastRow | null;
  scheduled: number;
  sending: number;
  /** Recipients reached across every broadcast in the history. */
  delivered: number;
  failed: number;
}

export const summarizeBroadcasts = (rows: BroadcastRow[]): BroadcastSummary => {
  const summary: BroadcastSummary = { latest: null, scheduled: 0, sending: 0, delivered: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === 'scheduled') summary.scheduled += 1;
    if (row.status === 'sending') summary.sending += 1;
    summary.delivered += row.sentCount;
    summary.failed += row.failedCount;
    if (
      !summary.latest
      || new Date(row.createdAt).getTime() > new Date(summary.latest.createdAt).getTime()
    ) {
      summary.latest = row;
    }
  }
  return summary;
};
